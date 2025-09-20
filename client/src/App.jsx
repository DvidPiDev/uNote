import React, { useState, useEffect, useRef } from 'react';
import { Search, Plus, LogOut, Eye, Edit, FileText, Save, Menu, X, FolderPlus, File, Folder } from 'lucide-react';

const formatTime = (isoString) => {
  const date = new Date(isoString);
  return date.toLocaleString();
};

const api = {
  async request(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error' }));
      throw new Error(error.error || 'Request failed');
    }

    return response.json();
  },

  async getNewTotp() {
    return this.request('/totp/new');
  },

  async signup(secret, code, name) {
    return this.request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ secret, code, name }),
    });
  },

  async login(code) {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  async getMe() {
    return this.request('/user/me');
  },

  async getSubjects() {
    return this.request('/user/subjects');
  },

  async createSubject(subjectName ) {
    return this.request('/user/subject/create', {
      method: 'POST',
      body: JSON.stringify({ subjectName }),
    });
  },

  async renameSubject(oldName, newName) {
    return this.request('/user/subject/rename', {
      method: 'POST',
      body: JSON.stringify({ oldName, newName }),
    });
  },

  async deleteSubject(subjectName, deleteFiles = false) {
    return this.request('/user/subject/delete', {
      method: 'POST',
      body: JSON.stringify({ subjectName, deleteFiles }),
    });
  },

  async getNotes(subject = null) {
    const query = subject ? `?subject=${encodeURIComponent(subject)}` : '';
    return this.request(`/user/notes${query}`);
  },

  async getNote(path) {
    return this.request(`/user/note?path=${encodeURIComponent(path)}`);
  },

  async saveNote(path, content) {
    return this.request('/user/note/save', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    });
  },

  async createNote(subject, title, content = '') {
    return this.request('/user/note/create', {
      method: 'POST',
      body: JSON.stringify({ subject, title, content }),
    });
  },

  async deleteNote(path) {
    return this.request('/user/note/delete', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  },

  async renameNote(oldPath, newName) {
    return this.request('/user/note/rename', {
      method: 'POST',
      body: JSON.stringify({ oldPath, newName }),
    });
  },

  async moveNote(oldPath, targetSubject) {
    return this.request('/user/note/move', {
      method: 'POST',
      body: JSON.stringify({ oldPath, targetSubject }),
    });
  },
};

const ContextMenu = ({ x, y, items, onClose }) => {
  const menuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="fixed bg-ctp-base/50 backdrop-blur-sm border border-ctp-text/10 rounded-lg shadow-lg z-50 min-w-48"
      style={{ left: x, top: y }}
    >
      {items && items.map((item, i) => (
        <button
          key={i}
          onClick={() => { item.onClick?.(); onClose(); }}
          className="w-full text-left px-4 py-2 hover:bg-ctp-base flex items-center gap-2 text-ctp-text"
          disabled={item.disabled}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
};

const Auth = ({ onLogin }) => {
  const [qrData, setQrData] = useState(null);
  const [code, setCode] = useState('');
  const [isSignup, setIsSignup] = useState(false);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    generateQR();
  }, []);

  const generateQR = async () => {
    try {
      const data = await api.getNewTotp();
      setQrData(data);
    } catch (err) {
      setError('Failed to generate QR code');
    }
  };

  const handleCodeChange = (value) => {
    setCode(value);
    if (value.length === 6 && !isSignup) {
      handleLogin(value);
    }
  };

  const handleLogin = async (totpCode) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.login(totpCode || code);
      localStorage.setItem('token', result.token);
      onLogin(result.user);

      window.location.reload(); // <-- sidebar stays empty until manual reload if this isn't here
    } catch (err) {
      if (err.message === 'Invalid code' && !isSignup) {
        setIsSignup(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.signup(qrData.secret, code, name.trim());
      localStorage.setItem('token', result.token);
      onLogin(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen login-bg bg-center bg-cover flex items-center justify-center p-4">
      <div className="bg-ctp-crust/70 backdrop-blur-xl rounded-2xl shadow-xl p-8 w-full max-w-md border-2 border-ctp-base/80 drop-shadow-2xl">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ctp-text mb-1">μNote</h1>
          <p className="text-ctp-text/70">Stupidly simple note taking</p>
        </div>

        {qrData && !isSignup && (
          <div className="mb-6 text-center">
            <img src={qrData.qrDataUrl} alt="QR Code" className="mx-auto mb-4 rounded-lg" />
            <p className="text-sm text-ctp-text/70">
              Scan with your TOTP app or enter your current code below
            </p>
          </div>
        )}

        {isSignup ? (
          <form onSubmit={handleSignup}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-ctp-text mb-2">
                Your Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-ctp-text/10 rounded-lg focus:border-1 focus:outline-0 bg-ctp-mantle/80 text-ctp-text"
                placeholder="John Smith"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ctp-blue-600/50 hover:bg-ctp-blue-400/50 disabled:opacity-50 text-ctp-text font-medium py-3 px-4 rounded-lg transition-colors"
            >
              {loading ? 'Creating Account...' : 'Let\'s go!'}
            </button>
          </form>
        ) : (
          <div className="mb-6">
            <label className="block text-sm font-medium text-ctp-text mb-2">
              TOTP Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => handleCodeChange(e.target.value)}
              className="w-full px-4 py-3 border border-ctp-text/10 rounded-lg focus:border-1 text-center text-2xl focus:outline-0 bg-ctp-mantle/80 text-ctp-text"
              placeholder="000000"
              maxLength={6}
              autoComplete="one-time-code"
            />
          </div>
        )}

        {error && (
          <div className="mb-4 mt-4 p-3  bg-ctp-red-700/20 border border-ctp-red-700 rounded-lg">
            <p className="text-sm text-ctp-red-100">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [subjects, setSubjects] = useState({});
  const [notes, setNotes] = useState([]);
  const [currentNote, setCurrentNote] = useState(null);
  const [noteContent, setNoteContent] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [viewMode, setViewMode] = useState('edit'); // 'read', 'edit', 'both'
  const [contextMenu, setContextMenu] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved', 'saving', 'error'
  const [draggedNote, setDraggedNote] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [renaming, setRenaming] = useState(null); // {type, id}
  const [pendingDelete, setPendingDelete] = useState(null); // {type, id}
  const [searchIndex, setSearchIndex] = useState(0);

  const editorRef = useRef(null);
  const lastSaveRef = useRef('');

  useEffect(() => {
    const initApp = async () => {
      const token = localStorage.getItem('token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const userData = await api.getMe();
        setUser(userData);
        await loadSubjects();
        await loadNotes();
      } catch (err) {
        localStorage.removeItem('token');
        console.error('Init error:', err);
      } finally {
        setLoading(false);
      }
    };

    initApp();
  }, []);

  useEffect(() => {
    const handleKeydown = (e) => {
      // ctrl + s
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (currentNote) {
          saveNote();
        }
      }
    };

    document.addEventListener('keydown', handleKeydown);
    return () => document.removeEventListener('keydown', handleKeydown);
  }, [currentNote]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };

    const handleClick = (e) => {
      if (searchOpen && !e.target.closest('.search-modal')) {
        setSearchOpen(false);
      }
    };

    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClick);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClick);
    };
  }, [searchOpen]);


  const loadSubjects = async () => {
    try {
      const data = await api.getSubjects();
      setSubjects(data);
    } catch (err) {
      console.error('Load subjects error:', err);
    }
  };

  const loadNotes = async (subject = null) => {
    try {
      const data = await api.getNotes(subject);
      setNotes(data);
    } catch (err) {
      console.error('Load notes error:', err);
    }
  };

  const openNote = async (note) => {
    try {
      setSaveStatus('saved');
      const data = await api.getNote(note.path);
      setCurrentNote(note);
      setNoteContent(data.content);
      lastSaveRef.current = data.content;
    } catch (err) {
      console.error('Open note error:', err);
    }
  };

  const saveNote = async () => {
    if (!currentNote) return;

    setSaveStatus('saving');
    try {
      await api.saveNote(currentNote.path, noteContent);
      setSaveStatus('saved');
      lastSaveRef.current = noteContent;
    } catch (err) {
      setSaveStatus('error');
      console.error('Manual save error:', err);
    }
  };

  const createNote = async (subject = null, title = '') => {
    try {
      const result = await api.createNote(subject, title);
      await loadNotes();
      const newNote = { path: result.path, name: result.path.split('/').pop(), subject };
      await openNote(newNote);
    } catch (err) {
      console.error('Create note error:', err);
    }
  };

  const deleteNote = async (note) => {
    if (pendingDelete?.id !== note.path) {
      setPendingDelete({ type: 'note', id: note.path });
      return;
    }

    try {
      await api.deleteNote(note.path);
      await loadNotes();
      if (currentNote && currentNote.path === note.path) {
        setCurrentNote(null);
        setNoteContent('');
      }
    } catch (err) {
      console.error('Delete note error:', err);
    } finally {
      setPendingDelete(null);
    }
  };

  const deleteSubject = async (subjectName) => {
    if (pendingDelete?.id !== subjectName) {
      setPendingDelete({ type: 'subject', id: subjectName });
      return;
    }

    try {
      await api.deleteSubject(subjectName, true);
      await loadSubjects();
      await loadNotes();
    } catch (err) {
      console.error('Delete subject error:', err);
    } finally {
      setPendingDelete(null);
    }
  };

  const createSubject = async (name) => {
    try {
      await api.createSubject(name);
      await loadSubjects();
    } catch (err) {
      console.error('Create subject error:', err);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    setCurrentNote(null);
    setNoteContent('');
  };

  const handleRightClick = (e, type, item = null) => {
    e.preventDefault();
    e.stopPropagation();

    const items = [];

    if (type === 'subject') {
      items.push(
        { icon: <Plus size={16} />, label: 'New Note', onClick: () => createNote(item.name) },
        { icon: <Edit size={16} />, label: 'Rename', onClick: () => renameSubject(item.name) },
        {
          icon: <X size={16} />,
          label: pendingDelete?.id === item.name ? 'You sure?' : 'Delete',
          onClick: () => deleteSubject(item.name)
        }
      );
    } else if (type === 'note') {
      items.push(
        { icon: <Edit size={16} />, label: 'Rename', onClick: () => renameNote(item) },
        {
          icon: <X size={16} />,
          label: pendingDelete?.id === item.path ? 'You sure?' : 'Delete',
          onClick: () => deleteNote(item)
        }
      );
    } else if (type === 'sidebar') {
      items.push(
        //{ icon: <Plus size={16} />, label: 'New Note', onClick: () => createNote() }, TODO: renaming doesn't work for notes in the root folder
        { icon: <FolderPlus size={16} />, label: 'New Subject', onClick: () => {
            // TODO: replace with inline input later
            const name = prompt('Subject name:');
            if (name) createSubject(name);
          }}
      );
    }

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const renameSubject = (oldName) => {
    setRenaming({ type: 'subject', id: oldName });
  };

  const handleDragStart = (e, note) => {
    setDraggedNote(note);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, targetSubject = null) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(targetSubject);
  };

  const handleDragLeave = () => {
    setDragOver(null);
  };

  const handleDrop = async (e, targetSubject = null) => {
    e.preventDefault();
    setDragOver(null);

    if (!draggedNote) return;

    if (draggedNote.subject === targetSubject) {
      setDraggedNote(null);
      return;
    }

    try {
      await api.moveNote(draggedNote.path, targetSubject);
      await loadNotes();
      if (currentNote && currentNote.path === draggedNote.path) {
        const newPath = targetSubject ?
          `${targetSubject}/${draggedNote.name}` :
          draggedNote.name;
        setCurrentNote({ ...currentNote, path: newPath, subject: targetSubject });
      }
    } catch (err) {
      console.error('Move note error:', err);
    }

    setDraggedNote(null);
  };

  const renameNote = (note) => {
    setRenaming({ type: 'note', id: note.path });
  };

  const renderMarkdown = (content) => {
    // TODO: basic regex based renderer for now - THIS WILL BE EXPANDED!!!
    return content
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\n/g, '<br>');
  };

  const filteredNotes = notes.filter(note =>
    note.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (note.subject && note.subject.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (!user) {
    return <Auth onLogin={setUser} />;
  }

  return (
    <div className="min-h-screen bg-ctp-mantle flex mocha transition-colors duration-200">
      {/* sidebar */}
      <div
        className={`bg-ctp-base border-r border-ctp-text/10 flex flex-col transform transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: sidebarWidth, minWidth: 250 }}
        onContextMenu={(e) => handleRightClick(e, 'sidebar')}
      >
          {/* sidebar header */}
          <div className="p-4 border-b border-ctp-text/10">
            <h2 className="font-semibold text-ctp-text">μNotes</h2>
          </div>

          {/* Notes Tree */}
          <div className="flex-1 overflow-y-auto">
            {/* Root notes */}
            <div
              onDragOver={(e) => handleDragOver(e, null)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, null)}
            >
              {notes.filter(note => !note.subject).map(note => (
                <div
                  key={note.path}
                  draggable
                  onDragStart={(e) => handleDragStart(e, note)}
                  className="flex items-center px-4 py-2 hover:bg-ctp-text/5 cursor-pointer group relative transition-colors duration-300"
                  onDoubleClick={() => openNote(note)}
                  onContextMenu={(e) => handleRightClick(e, 'note', note)}
                >
                  <File size={16} className="mr-2 text-ctp-text" />
                  <span className="text-sm text-ctp-text truncate flex-1">
                    {note.name.replace('.md', '')}
                  </span>
                  {currentNote && currentNote.path === note.path && (
                    <div className={`w-2 h-2 rounded-full ml-2 ${
                      saveStatus === 'saved' ? 'bg-ctp-green-400' :
                        saveStatus === 'saving' ? 'bg-ctp-yellow-400 animate-pulse' :
                          'bg-ctp-red-400'
                    }`} />
                  )}
                </div>
              ))}
            </div>

            {/* Subjects */}
            {Object.keys(subjects).map(subjectName => (
              <div key={subjectName} className="mb-2">
                <div
                  className={`flex items-center px-4 py-2 hover:bg-ctp-text/5 cursor-pointer font-medium transition-colors duration-300 ${
                    dragOver === subjectName ? 'bg-ctp-sapphire-800/10' : ''
                  }`}
                  onContextMenu={(e) => handleRightClick(e, 'subject', { name: subjectName })}
                  onDoubleClick={() => createNote(subjectName)}
                  onDragOver={(e) => handleDragOver(e, subjectName)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, subjectName)}
                >
                  <Folder size={16} className="mr-2 text-ctp-text" />
                  {renaming?.type === 'subject' && renaming.id === subjectName ? (
                    <input
                      type="text"
                      defaultValue={subjectName}
                      autoFocus
                      onBlur={async (e) => {
                        const newName = e.target.value.trim();
                        if (newName && newName !== subjectName) {
                          await api.renameSubject(subjectName, newName);
                          await loadSubjects();
                          await loadNotes();
                        }
                        setRenaming(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.target.blur();
                      }}
                      className="bg-ctp-mantle text-ctp-text px-1 rounded"
                    />
                  ) : (
                    <span className="text-sm text-ctp-text truncate">{subjectName}</span>
                  )}
                </div>

                {/* Subject notes */}
                {notes.filter(note => note.subject === subjectName).map(note => (
                  <div
                    key={note.path}
                    draggable
                    onDragStart={(e) => handleDragStart(e, note)}
                    className="flex items-center pl-8 pr-4 py-1 hover:bg-ctp-text/5 cursor-pointer group relative transition-colors duration-300"
                    onDoubleClick={() => openNote(note)}
                    onContextMenu={(e) => handleRightClick(e, 'note', note)}
                  >
                    <File size={14} className="mr-2 text-ctp-text/80" />
                    {renaming?.type === 'note' && renaming.id === note.path ? (
                      <input
                        type="text"
                        defaultValue={note.name.replace('.md','')}
                        autoFocus
                        onBlur={async (e) => {
                          const newName = e.target.value.trim();
                          if (newName && newName !== note.name.replace('.md','')) {
                            await api.renameNote(note.path, newName);
                            await loadNotes();
                            if (currentNote && currentNote.path === note.path) {
                              const newPath = note.path.replace(note.name, `${newName}.md`);
                              setCurrentNote({ ...currentNote, path: newPath, name: `${newName}.md` });
                            }
                          }
                          setRenaming(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                        }}
                        className="bg-ctp-mantle text-ctp-text px-1 rounded"
                      />
                    ) : (
                      <span className="text-sm text-ctp-text truncate flex-1">
    {note.name.replace('.md','')}
  </span>
                    )}
                    {currentNote && currentNote.path === note.path && (
                      <div className={`w-2 h-2 rounded-full ml-2 ${
                        saveStatus === 'saved' ? 'bg-ctp-green-400' :
                          saveStatus === 'saving' ? 'bg-ctp-yellow-400 animate-pulse' :
                            'bg-ctp-red-400'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Sidebar Footer */}
          <div className="border-t border-ctp-text/10 p-3 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  const modes = ['read', 'both', 'edit'];
                  const currentIndex = modes.indexOf(viewMode);
                  setViewMode(modes[(currentIndex + 1) % modes.length]);
                }}
                className="p-2 rounded-lg hover:bg-ctp-text/10 transition-colors duration-300 text-ctp-text"
                title="View mode"
              >
                {viewMode === 'read' ? <Eye size={16} /> :
                  viewMode === 'both' ? <FileText size={16} /> :
                    <Edit size={16} />}
              </button>
              <button
                onClick={() => createNote()}
                className="p-2 rounded-lg hover:bg-ctp-text/10 transition-colors duration-300 text-ctp-text"
                title="New note"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg hover:bg-ctp-red-900/10 transition-colors duration-300 text-ctp-red-500"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col transform transition-all duration-300 ${
          sidebarOpen ? 'ml-0' : '-ml-[280px]'
        }`}
      >
        {/* Top Bar */}
        <div className="bg-ctp-base border-b border-ctp-text/10 p-4 h-[57px] flex items-center justify-between"> {/* 57px is a stupid fix, but it works */ }
          <div className="flex items-center space-x-4">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-ctp-text/10 transition-colors duration-300 text-ctp-text"
            >
              <Menu size={20} />
            </button>
            {currentNote && (
              <div className="flex items-center space-x-2">
                <span className="text-lg font-medium text-ctp-text">
                  {currentNote.name.replace('.md', '')}
                </span>
                <button
                  onClick={saveNote}
                  className="p-1 rounded hover:bg-ctp-text/10 transition-colors duration-300 text-ctp-text"
                  title="Save (Ctrl+S)"
                >
                  <Save size={16} />
                </button>
              </div>
            )}
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2 rounded-lg hover:bg-ctp-text/10 transition-colors duration-300 text-ctp-text"
            title="Search (Ctrl+Ctrl)"
          >
            <Search size={20} />
          </button>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex">
          {currentNote ? (
            <>
              {/* Editor */}
              {(viewMode === 'edit' || viewMode === 'both') && (
                <div className={`${viewMode === 'both' ? 'w-1/2' : 'w-full'} p-4`}>
                  <textarea
                    ref={editorRef}
                    value={noteContent}
                    onChange={(e) => setNoteContent(e.target.value)}
                    className="w-full h-full resize-none border-none outline-none bg-transparent text-ctp-text font-mono text-sm leading-relaxed"
                    placeholder="Start writing..."
                    spellCheck
                  />
                </div>
              )}

              {/* Preview */}
              {(viewMode === 'read' || viewMode === 'both') && (
                <div className={`${viewMode === 'both' ? 'w-1/2 border-l border-ctp-text/10' : 'w-full'} p-4 overflow-y-auto`}>
                  <div
                    className="prose dark:prose-invert max-w-none text-ctp-text"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(noteContent) }}
                  />
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-4xl font-light text-ctp-text mb-2">Hello!</h2>
                <p className="text-ctp-text/50">Select a note to start writing</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 bg-ctp-crust/10 backdrop-anim flex items-start justify-center pt-20 z-50">
          <div className="bg-ctp-crust rounded-lg shadow-xl w-full max-w-2xl mx-4">
            <div className="p-4 border-b border-ctp-text/10">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search notes..."
                className="w-full px-4 py-2 border-ctp-text/10 rounded-lg focus:ring-0 focus:border-transparent text-ctp-text focus:outline-0"
                autoFocus
              />
            </div>
            <div className="max-h-96 overflow-y-auto">
              {filteredNotes.map(note => (
                <div
                  key={note.path}
                  onClick={() => {
                    openNote(note);
                    setSearchOpen(false);
                    setSearchTerm('');
                  }}
                  className="p-4 hover:bg-ctp-text/5 cursor-pointer border-b border-ctp-text/10 last:border-b-0 transition-colors duration-300"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-medium text-ctp-text">
                        {note.name.replace('.md', '')}
                      </h3>
                      {note.subject && (
                        <p className="text-sm  text-ctp-text/75">
                          in {note.subject}
                        </p>
                      )}
                    </div>
                    <span className="text-xs  text-ctp-text/50">
                      {formatTime(note.mtime)}
                    </span>
                  </div>
                </div>
              ))}
              {filteredNotes.length === 0 && searchTerm && (
                <div className="p-8 text-center  text-ctp-text">
                  No notes found matching "{searchTerm}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
};

export default App;