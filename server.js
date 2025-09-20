const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'ASDHJKASHDKJLHAJHCIHIUSDKJVSD'; // doesn't have to be very secure, everything is unencrypted anyway

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'client')));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([] , null, 2), 'utf8');

function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  } catch (e) {
    console.error('Failed reading users.json', e);
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function userDir(userId) {
  return path.join(DATA_DIR, userId);
}

function ensureUserDirs(userId) {
  const dir = userDir(userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const subjectsFile = path.join(dir, 'subjects.json');
  if (!fs.existsSync(subjectsFile)) fs.writeFileSync(subjectsFile, JSON.stringify({}, null, 2), 'utf8');
}

function safeBaseName(name) {
  if (!name) return '';
  const trimmed = String(name).trim();
  const noSlash = trimmed.replace(/[\/\\]+/g, '-').replace(/^\.+/, '');
  const slug = noSlash.replace(/\s+/g, '-').replace(/[^-\w\u00A0-\uFFFF]/g, '');
  return slug.replace(/-+/g, '-').slice(0, 200) || 'untitled';
}

function ensureMdExt(name) {
  if (name.toLowerCase().endsWith('.md')) return name;
  return `${name}.md`;
}

function isInsideUserDir(userId, fullPath) {
  const base = path.resolve(userDir(userId));
  const resolved = path.resolve(fullPath);
  return resolved.startsWith(base + path.sep) || resolved === base;
}

app.get('/api/totp/new', async (req, res) => {
  const secret = speakeasy.generateSecret({ length: 20, name: 'TinyNotes' });
  const otpauth_url = secret.otpauth_url;
  try {
    const qrDataUrl = await qrcode.toDataURL(otpauth_url);
    res.json({
      secret: secret.base32,
      otpauth_url,
      qrDataUrl
    });
  } catch (err) {
    console.error('qr generation err', err);
    res.status(500).json({ error: 'QR generation failed' });
  }
});

app.post('/api/auth/signup', (req, res) => {
  const { secret, code, name } = req.body;
  if (!secret || !code || !name) return res.status(400).json({ error: 'secret, code and name required' });

  const verified = speakeasy.totp.verify({
    secret,
    encoding: 'base32',
    token: code,
    window: 1
  });

  if (!verified) return res.status(400).json({ error: 'Invalid TOTP code' });

  const users = readUsers();
  const id = uuidv4();
  const newUser = {
    id,
    name,
    secret,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  writeUsers(users);

  ensureUserDirs(id);

  const token = jwt.sign({ userId: id }, JWT_SECRET);
  res.json({ ok: true, user: { id, name }, token });
});

app.post('/api/auth/login', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });

  const users = readUsers();

  for (const u of users) {
    const ok = speakeasy.totp.verify({
      secret: u.secret,
      encoding: 'base32',
      token: code,
      window: 1
    });
    if (ok) {
      const token = jwt.sign({ userId: u.id }, JWT_SECRET);
      const { id, name } = u;
      return res.json({ ok: true, user: { id, name }, token });
    }
  }
  res.status(401).json({ error: 'Invalid code' });
});

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.userId = payload.userId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

app.get('/api/user/me', authMiddleware, (req, res) => {
  const users = readUsers();
  const user = users.find(u => u.id === req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ id: user.id, name: user.name, createdAt: user.createdAt });
});

app.get('/api/user/subjects', authMiddleware, (req, res) => {
  try {
    const subjectsFile = path.join(userDir(req.userId), 'subjects.json');
    if (!fs.existsSync(subjectsFile)) {
      ensureUserDirs(req.userId);
    }
    const content = JSON.parse(fs.readFileSync(subjectsFile, 'utf8'));
    res.json(content);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read subjects' });
  }
});

app.post('/api/user/subject/create', authMiddleware, (req, res) => {
  const { subjectName } = req.body;
  if (!subjectName) return res.status(400).json({ error: 'subjectName required' });
  const base = userDir(req.userId);
  const subjectsFile = path.join(base, 'subjects.json');
  const subjects = fs.existsSync(subjectsFile) ? JSON.parse(fs.readFileSync(subjectsFile,'utf8')) : {};
  if (subjects[subjectName]) return res.status(400).json({ error: 'subject already exists' });
  subjects[subjectName] = { icon: null };
  fs.writeFileSync(subjectsFile, JSON.stringify(subjects, null, 2), 'utf8');
  const dir = path.join(base, subjectName);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  res.json({ ok: true, subject: { name: subjectName } });
});

app.post('/api/user/subject/rename', authMiddleware, (req, res) => {
  const { oldName, newName } = req.body;
  if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });

  const safeNew = safeBaseName(newName);
  if (!safeNew) return res.status(400).json({ error: 'invalid newName' });

  const base = userDir(req.userId);
  const subjectsFile = path.join(base, 'subjects.json');
  const subjects = fs.existsSync(subjectsFile) ? JSON.parse(fs.readFileSync(subjectsFile,'utf8')) : {};
  if (!subjects[oldName]) return res.status(404).json({ error: 'old subject not found' });
  if (subjects[safeNew]) return res.status(400).json({ error: 'target subject name already exists' });

  const oldDir = path.join(base, oldName);
  const newDir = path.join(base, safeNew);
  try {
    if (fs.existsSync(oldDir)) {
      fs.renameSync(oldDir, newDir);
    } else {
      if (!fs.existsSync(newDir)) fs.mkdirSync(newDir, { recursive: true });
    }

    subjects[safeNew] = subjects[oldName];
    delete subjects[oldName];
    fs.writeFileSync(subjectsFile, JSON.stringify(subjects, null, 2), 'utf8');
    res.json({ ok: true, subject: { name: safeNew } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rename subject' });
  }
});

app.post('/api/user/subject/delete', authMiddleware, (req, res) => {
  const { subjectName, deleteFiles } = req.body;
  if (!subjectName) return res.status(400).json({ error: 'subjectName required' });
  const base = userDir(req.userId);
  const subjectsFile = path.join(base, 'subjects.json');
  const subjects = fs.existsSync(subjectsFile) ? JSON.parse(fs.readFileSync(subjectsFile,'utf8')) : {};
  if (!subjects[subjectName]) return res.status(404).json({ error: 'subject not found' });
  delete subjects[subjectName];
  fs.writeFileSync(subjectsFile, JSON.stringify(subjects, null, 2), 'utf8');
  if (deleteFiles) {
    const dir = path.join(base, subjectName);
    if (fs.existsSync(dir)) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch (err) {
        console.error(err);
      }
    }
  }
  res.json({ ok: true });
});

app.get('/api/user/notes', authMiddleware, (req, res) => {
  const subject = req.query.subject;
  const base = userDir(req.userId);
  try {
    const result = [];
    if (subject) {
      const dir = path.join(base, subject);
      if (!fs.existsSync(dir)) {
        return res.json([]);
      }
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.md')) {
          const stat = fs.statSync(path.join(dir, f));
          result.push({ name: f, subject, path: path.join(subject, f), mtime: stat.mtime.toISOString() });
        }
      }
    } else {
      const files = fs.readdirSync(base).filter(x => x.endsWith('.md'));
      for (const f of files) {
        const stat = fs.statSync(path.join(base, f));
        result.push({ name: f, subject: null, path: f, mtime: stat.mtime.toISOString() });
      }

      const subjectsFile = path.join(base, 'subjects.json');
      const subjects = fs.existsSync(subjectsFile) ? JSON.parse(fs.readFileSync(subjectsFile,'utf8')) : {};
      for (const s of Object.keys(subjects)) {
        const dir = path.join(base, s);
        if (!fs.existsSync(dir)) continue;
        const files2 = fs.readdirSync(dir).filter(x => x.endsWith('.md'));
        for (const f of files2) {
          const stat = fs.statSync(path.join(dir, f));
          result.push({ name: f, subject: s, path: path.join(s, f), mtime: stat.mtime.toISOString() });
        }
      }
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to list notes' });
  }
});

app.get('/api/user/note', authMiddleware, (req, res) => {
  const p = req.query.path;
  if (!p) return res.status(400).json({ error: 'path required' });
  const full = path.join(userDir(req.userId), p);
  if (!isInsideUserDir(req.userId, full)) return res.status(400).json({ error: 'invalid path' });
  if (!fs.existsSync(full)) return res.status(404).json({ error: 'note not found' });
  try {
    const content = fs.readFileSync(full, 'utf8');
    res.json({ path: p, content });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to read note' });
  }
});

app.post('/api/user/note/save', authMiddleware, (req, res) => {
  const { path: relPath, content } = req.body;
  if (!relPath || typeof content !== 'string') return res.status(400).json({ error: 'path and content required' });
  const full = path.join(userDir(req.userId), relPath);
  if (!isInsideUserDir(req.userId, full)) return res.status(400).json({ error: 'invalid path' });
  try {
    const dir = path.dirname(full);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(full, content, 'utf8');
    res.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save note' });
  }
});

app.post('/api/user/note/create', authMiddleware, (req, res) => {
  const { subject, title, content } = req.body;
  try {
    const base = userDir(req.userId);
    const dir = subject ? path.join(base, subject) : base;
    if (!isInsideUserDir(req.userId, dir)) return res.status(400).json({ error: 'invalid subject' });
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let filename;
    if (title) {
      const safe = safeBaseName(title);
      filename = ensureMdExt(safe);
    } else {
      filename = `note-${Date.now()}.md`;
    }

    const fullPath = (() => {
      let candidate = path.join(dir, filename);
      let i = 1;
      while (fs.existsSync(candidate)) {
        const baseName = filename.replace(/\.md$/i, '');
        candidate = path.join(dir, `${baseName}-${i}.md`);
        i++;
      }
      return candidate;
    })();

    fs.writeFileSync(fullPath, content || '', 'utf8');
    const rel = path.relative(base, fullPath);
    res.json({ ok: true, path: rel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

app.post('/api/user/note/delete', authMiddleware, (req, res) => {
  const { path: relPath } = req.body;
  if (!relPath) return res.status(400).json({ error: 'path required' });
  const full = path.join(userDir(req.userId), relPath);
  if (!isInsideUserDir(req.userId, full)) return res.status(400).json({ error: 'invalid path' });
  try {
    if (fs.existsSync(full)) {
      fs.unlinkSync(full);
      res.json({ ok: true });
    } else {
      res.status(404).json({ error: 'note not found' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

app.post('/api/user/note/rename', authMiddleware, (req, res) => {
  const { oldPath, newName } = req.body;
  if (!oldPath || !newName) return res.status(400).json({ error: 'oldPath and newName required' });
  const base = userDir(req.userId);
  const oldFull = path.join(base, oldPath);
  if (!isInsideUserDir(req.userId, oldFull)) return res.status(400).json({ error: 'invalid oldPath' });
  if (!fs.existsSync(oldFull)) return res.status(404).json({ error: 'source file not found' });

  const dir = path.dirname(oldFull);
  const safe = safeBaseName(newName);
  const newFile = ensureMdExt(safe);
  const newFull = path.join(dir, newFile);
  if (!isInsideUserDir(req.userId, newFull)) return res.status(400).json({ error: 'invalid newName' });

  try {
    if (fs.existsSync(newFull)) return res.status(400).json({ error: 'target filename already exists' });
    fs.renameSync(oldFull, newFull);
    const rel = path.relative(base, newFull);
    res.json({ ok: true, path: rel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to rename note' });
  }
});

app.post('/api/user/note/move', authMiddleware, (req, res) => {
  const { oldPath, targetSubject } = req.body;
  if (!oldPath) return res.status(400).json({ error: 'oldPath required' });
  const base = userDir(req.userId);
  const oldFull = path.join(base, oldPath);
  if (!isInsideUserDir(req.userId, oldFull)) return res.status(400).json({ error: 'invalid oldPath' });
  if (!fs.existsSync(oldFull)) return res.status(404).json({ error: 'source file not found' });

  const filename = path.basename(oldFull);
  const targetDir = targetSubject ? path.join(base, targetSubject) : base;
  if (!isInsideUserDir(req.userId, targetDir)) return res.status(400).json({ error: 'invalid targetSubject' });

  try {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    let candidate = path.join(targetDir, filename);
    let i = 1;
    const baseName = filename.replace(/\.md$/i,'');
    while (fs.existsSync(candidate)) {
      candidate = path.join(targetDir, `${baseName}-${i}.md`);
      i++;
    }
    fs.renameSync(oldFull, candidate);
    const rel = path.relative(base, candidate);
    res.json({ ok: true, path: rel });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to move note' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Data folder: ${DATA_DIR}`);
});
