const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'posts.json');
const TEACHERS_FILE = path.join(__dirname, 'next_week_teachers.json');
const MAP_FILE = path.join(__dirname, 'sdc_map_data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── helpers ──────────────────────────────────────────
function loadPosts() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, '[]', 'utf-8');
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}
function savePosts(posts) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(posts, null, 2), 'utf-8');
}
function loadTeachers() {
  if (!fs.existsSync(TEACHERS_FILE)) fs.writeFileSync(TEACHERS_FILE, '{}', 'utf-8');
  return JSON.parse(fs.readFileSync(TEACHERS_FILE, 'utf-8'));
}

// ── map data ─────────────────────────────────────────
app.get('/api/mapdata', (req, res) => {
  res.json(JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8')));
});

// ── admin ─────────────────────────────────────────────
const ADMIN_PW = process.env.ADMIN_PW || 'sdc2025';

function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_PW)
    return res.status(401).json({ error: '인증 필요' });
  next();
}

function findSchool(data, name) {
  const lists = ['this_week_gangnam','this_week_bangwha','unvisited_gangnam','unvisited_bangwha'];
  for (const list of lists) {
    const idx = data[list].findIndex(s => s.name === name);
    if (idx !== -1)
      return { list, idx, school: data[list][idx], week: list.startsWith('this') ? 'this' : 'next' };
  }
  return null;
}

app.post('/api/admin/login', (req, res) => {
  if (req.body.password === ADMIN_PW) res.json({ ok: true });
  else res.status(401).json({ error: '비밀번호 오류' });
});

app.put('/api/admin/schools/:name', adminAuth, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const data = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
  const teachers = loadTeachers();
  const found = findSchool(data, name);
  if (!found) return res.status(404).json({ error: '학교 없음' });
  const { list, idx, school } = found;
  const { teacher, week } = req.body;

  if (teacher !== undefined) {
    if (found.week === 'this') data[list][idx].teacher = teacher;
    else if (teacher) teachers[name] = teacher; else delete teachers[name];
  }

  if (week !== undefined && week !== found.week) {
    const newList = week === 'this'
      ? (school.type === 'gangnam' ? 'this_week_gangnam' : 'this_week_bangwha')
      : (school.type === 'gangnam' ? 'unvisited_gangnam' : 'unvisited_bangwha');
    if (week === 'this' && teachers[name]) { school.teacher = teachers[name]; delete teachers[name]; }
    if (week === 'next' && school.teacher) { teachers[name] = school.teacher; }
    data[list].splice(idx, 1);
    data[newList].push(school);
  }

  fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2), 'utf-8');
  fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2), 'utf-8');
  res.json({ ok: true });
});

app.post('/api/admin/schools', adminAuth, (req, res) => {
  const { name, type, week, teacher, lat, lon, addr, subway, group, region } = req.body;
  if (!name || !type || !week) return res.status(400).json({ error: 'name, type, week 필수' });
  const data = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
  const school = {
    name, addr: addr||'', subway: subway||'', gangnam_dist:'', group: group||'',
    teacher: week==='this' ? (teacher||'') : '', type,
    lat: parseFloat(lat)||0, lon: parseFloat(lon)||0,
    dist_from_school:0, region: region||'', addr_full: addr||''
  };
  const list = week==='this'
    ? (type==='gangnam' ? 'this_week_gangnam' : 'this_week_bangwha')
    : (type==='gangnam' ? 'unvisited_gangnam' : 'unvisited_bangwha');
  data[list].push(school);
  if (week==='next' && teacher) { const t=loadTeachers(); t[name]=teacher; fs.writeFileSync(TEACHERS_FILE,JSON.stringify(t,null,2),'utf-8'); }
  fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2), 'utf-8');
  res.status(201).json({ ...school, week });
});

app.delete('/api/admin/schools/:name', adminAuth, (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const data = JSON.parse(fs.readFileSync(MAP_FILE, 'utf-8'));
  const teachers = loadTeachers();
  const lists = ['this_week_gangnam','this_week_bangwha','unvisited_gangnam','unvisited_bangwha'];
  let found = false;
  for (const list of lists) {
    const before = data[list].length;
    data[list] = data[list].filter(s => s.name !== name);
    if (data[list].length < before) found = true;
  }
  if (!found) return res.status(404).json({ error: '학교 없음' });
  delete teachers[name];
  fs.writeFileSync(MAP_FILE, JSON.stringify(data, null, 2), 'utf-8');
  fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2), 'utf-8');
  res.json({ ok: true });
});

// ── next-week teacher assignment ──────────────────────
app.get('/api/nextweek-teachers', (req, res) => {
  res.json(loadTeachers());
});

app.put('/api/nextweek-teachers/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  const { teacher } = req.body;
  const teachers = loadTeachers();
  if (teacher && teacher.trim()) {
    teachers[name] = teacher.trim();
  } else {
    delete teachers[name];
  }
  fs.writeFileSync(TEACHERS_FILE, JSON.stringify(teachers, null, 2), 'utf-8');
  res.json({ name, teacher: teachers[name] || null });
});

// ── posts ─────────────────────────────────────────────
app.get('/api/posts', (req, res) => {
  const posts = loadPosts()
    .map(({ pw: _, ...p }) => p)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(posts);
});

app.post('/api/posts', async (req, res) => {
  const { author, pw, body } = req.body;
  if (!author || !pw || !body)
    return res.status(400).json({ error: 'author, pw, body는 필수입니다.' });

  const posts = loadPosts();
  const post = {
    id: uuidv4(),
    author,
    pw: await bcrypt.hash(pw, 10),
    body,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    comments: [],
  };
  posts.push(post);
  savePosts(posts);
  const { pw: _, ...safe } = post;
  res.status(201).json(safe);
});

app.put('/api/posts/:id', async (req, res) => {
  const { pw, body } = req.body;
  if (!pw || !body)
    return res.status(400).json({ error: 'pw, body는 필수입니다.' });

  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  if (!await bcrypt.compare(pw, posts[idx].pw))
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });

  posts[idx].body = body;
  posts[idx].updatedAt = new Date().toISOString();
  savePosts(posts);
  const { pw: _, ...safe } = posts[idx];
  res.json(safe);
});

app.delete('/api/posts/:id', async (req, res) => {
  const { pw } = req.body;
  if (!pw) return res.status(400).json({ error: 'pw는 필수입니다.' });

  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
  if (!await bcrypt.compare(pw, posts[idx].pw))
    return res.status(401).json({ error: '비밀번호가 틀렸습니다.' });

  posts.splice(idx, 1);
  savePosts(posts);
  res.json({ message: '삭제되었습니다.' });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const { author, body } = req.body;
  if (!author || !body)
    return res.status(400).json({ error: 'author, body는 필수입니다.' });

  const posts = loadPosts();
  const idx = posts.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

  const comment = { id: uuidv4(), author, body, createdAt: new Date().toISOString() };
  posts[idx].comments.push(comment);
  savePosts(posts);
  res.status(201).json(comment);
});

app.listen(PORT, () => {
  console.log(`서버 실행중 http://localhost:${PORT}`);
});
