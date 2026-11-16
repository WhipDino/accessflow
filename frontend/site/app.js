// AccessFlow: globo 3D + gêmeo digital do local (Three.js, sem dependências externas em tempo de execução)
import * as THREE from './vendor/three.module.min.js';

const API = '/api';
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- domínio
const ZONES = {
  calcada:  { nome: 'Calçada',            pos: [-5, 0.12, 10.5] },
  vaga:     { nome: 'Vaga acessível',     pos: [-12, 0.12, 4] },
  rampa:    { nome: 'Rampa de acesso',    pos: [0, 0.4, 7.5] },
  entrada:  { nome: 'Entrada principal',  pos: [0, 0.66, 5.4] },
  recepcao: { nome: 'Recepção',           pos: [-3, 0.66, 3.6] },
  corredor: { nome: 'Corredor',           pos: [6, 0.66, 0] },
  banheiro: { nome: 'Banheiro acessível', pos: [8, 0.66, 3.6] },
  elevador: { nome: 'Elevador',           pos: [12, 0.66, 2.3] },
};
const SEV = { baixa: '#ffe27a', media: '#ffb648', alta: '#ff6b6b' };
const OK = '#3fe0c0';
const SEV_NOME = { baixa: 'Baixa', media: 'Média', alta: 'Alta' };
const ORIGEM = { manual: 'Registro manual', visao: 'Visão computacional', robo: 'Robô de inspeção' };
const corDe = (o) => (o.status === 'resolvida' ? OK : SEV[o.gravidade] || SEV.media);
const PESO = { baixa: 1, media: 2, alta: 3 };
function corDoLugar(p) { const pend = p.itens.filter((o) => o.status !== 'resolvida'); if (!pend.length) return OK; return SEV[pend.reduce((a, o) => ((PESO[o.gravidade] || 2) > (PESO[a] || 0) ? o.gravidade : a), 'baixa')] || SEV.media; }

// capitais para quando a geocodificação não responder (localização aproximada)
const CAPITAIS = { 'sao paulo': [-23.55, -46.63], 'rio de janeiro': [-22.91, -43.17], 'belo horizonte': [-19.92, -43.94], 'brasilia': [-15.79, -47.88],
  'salvador': [-12.97, -38.5], 'fortaleza': [-3.73, -38.52], 'recife': [-8.05, -34.88], 'porto alegre': [-30.03, -51.23], 'curitiba': [-25.43, -49.27],
  'manaus': [-3.12, -60.02], 'belem': [-1.46, -48.5], 'goiania': [-16.69, -49.26], 'florianopolis': [-27.59, -48.55], 'vitoria': [-20.32, -40.34],
  'natal': [-5.79, -35.21], 'campinas': [-22.91, -47.06], 'sao luis': [-2.53, -44.3], 'maceio': [-9.67, -35.74], 'joao pessoa': [-7.12, -34.86],
  'teresina': [-5.09, -42.8], 'campo grande': [-20.44, -54.65], 'cuiaba': [-15.6, -56.1], 'aracaju': [-10.91, -37.07], 'porto velho': [-8.76, -63.9],
  'macapa': [0.03, -51.07], 'boa vista': [2.82, -60.67], 'rio branco': [-9.97, -67.81], 'palmas': [-10.18, -48.33] };

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const state = { ocorrencias: [], mode: 'globe', place: null, selected: null, busy: false };

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (k === 'style') n.style.cssText = v; else n.setAttribute(k, v);
  }
  for (const c of kids) if (c != null) n.append(c);
  return n;
}
function haQuanto(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora mesmo'; if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`; return `há ${Math.floor(s / 86400)} d`;
}
function lugares() {
  const m = new Map();
  for (const o of state.ocorrencias) {
    const k = norm(o.local); if (!m.has(k)) m.set(k, { key: k, nome: o.local, endereco: o.endereco, lat: null, lng: null, itens: [] });
    const p = m.get(k); p.itens.push(o);
    if (p.lat == null && o.lat != null && o.lng != null) { p.lat = o.lat; p.lng = o.lng; }
    if (!p.endereco && o.endereco) p.endereco = o.endereco;
  }
  return [...m.values()];
}

// ---------------------------------------------------------------- API
async function carregar() {
  const r = await fetch(`${API}/ocorrencias`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error('falha ao listar');
  state.ocorrencias = await r.json();
  pintarResumo(); if (gl) { globe.sync(); if (state.mode === 'twin') twin.sync(); }
}
async function geocodificar(endereco) {
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 6000);
    const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=pt-BR&q=${encodeURIComponent(endereco)}`;
    const r = await fetch(u, { signal: ctl.signal }); clearTimeout(t);
    const j = r.ok ? await r.json() : [];
    if (j.length) return { lat: +j[0].lat, lng: +j[0].lon, aprox: false };
  } catch { /* cai no aproximado */ }
  const n = norm(endereco);
  for (const [nome, [lat, lng]] of Object.entries(CAPITAIS)) if (n.includes(nome)) return { lat, lng, aprox: true };
  return { lat: -23.55, lng: -46.63, aprox: true };
}

// ---------------------------------------------------------------- interface (globo)
function pintarResumo() {
  const ps = lugares();
  const pend = state.ocorrencias.filter((o) => o.status !== 'resolvida').length;
  $('st-pend').textContent = pend; $('st-res').textContent = state.ocorrencias.length - pend; $('st-loc').textContent = ps.length;
  const ul = $('places-list'); ul.replaceChildren(); const dl = $('locais-conhecidos'); dl.replaceChildren();
  ps.sort((a, b) => b.itens.filter((o) => o.status !== 'resolvida').length - a.itens.filter((o) => o.status !== 'resolvida').length);
  for (const p of ps) {
    const n = p.itens.filter((o) => o.status !== 'resolvida').length;
    ul.append(el('li', {}, el('button', { type: 'button', onclick: () => viajar(p.key) },
      el('span', { class: 'nm', text: p.nome }),
      el('span', { class: `bd ${n ? 'pend' : 'ok'}`, style: `color:${corDoLugar(p)};background:color-mix(in srgb, ${corDoLugar(p)} 16%, transparent)`, text: n ? `${n} pendente${n > 1 ? 's' : ''}` : 'livre' }),
      el('span', { class: 'ad', text: p.endereco || 'Endereço não informado' }))));
    dl.append(el('option', { value: p.nome }));
  }
}
function montarFormulario() {
  const box = $('chips-trecho');
  Object.entries(ZONES).forEach(([k, z], i) => box.append(el('label', {},
    el('input', Object.assign({ type: 'radio', name: 'trecho', value: k }, i === 2 ? { checked: '' } : {})), el('span', { text: z.nome }))));
  const form = $('form'), status = $('form-status'), btn = form.querySelector('.cta');
  $('f-local').addEventListener('change', (e) => {
    const p = lugares().find((x) => x.key === norm(e.target.value));
    if (p && p.endereco && !$('f-endereco').value) $('f-endereco').value = p.endereco;
  });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); if (state.busy) return;
    const fd = new FormData(form); const d = Object.fromEntries([...fd].map(([k, v]) => [k, String(v).trim()]));
    let ruim = null;
    for (const id of ['f-local', 'f-endereco', 'f-desc']) { const f = $(id); const vazio = !f.value.trim(); f.classList.toggle('invalid', vazio); if (vazio && !ruim) ruim = f; }
    if (ruim) { status.className = 'err'; status.textContent = 'Preencha os campos destacados.'; ruim.focus(); return; }
    state.busy = true; btn.disabled = true; status.className = '';
    try {
      const conhecido = lugares().find((p) => p.key === norm(d.local) && p.lat != null);
      let geo = conhecido ? { lat: conhecido.lat, lng: conhecido.lng, aprox: false } : null;
      if (!geo) { status.textContent = 'Localizando o endereço…'; geo = await geocodificar(d.endereco); }
      status.textContent = 'Registrando a ocorrência…';
      const r = await fetch(`${API}/ocorrencias`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...d, lat: geo.lat, lng: geo.lng, origem: 'manual' }) });
      if (!r.ok) throw new Error(`API respondeu ${r.status}`);
      const nova = await r.json(); await carregar();
      status.textContent = geo.aprox ? 'Registrada. Localização aproximada pela cidade.' : 'Registrada.';
      form.reset(); box.querySelectorAll('input')[2].checked = true;
      await viajar(norm(nova.local), nova.id);
      status.textContent = '';
    } catch (e) {
      status.className = 'err'; status.textContent = 'Não foi possível registrar agora. Tente de novo em instantes.'; console.error(e);
    } finally { state.busy = false; btn.disabled = false; }
  });
}

// ---------------------------------------------------------------- motor 3D
let gl = null, renderer, clock, globe, twin;
const canvas = $('gl');
const size = { w: innerWidth, h: innerHeight };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const tweens = new Set();
function tween(ms, fn) {
  return new Promise((res) => {
    if (REDUCED) ms = Math.min(ms, 1);
    const t0 = performance.now(); const tw = () => { const k = Math.min(1, (performance.now() - t0) / ms); fn(ease(k)); if (k >= 1) { tweens.delete(tw); res(); } };
    tweens.add(tw);
  });
}
const esperar = (ms) => new Promise((r) => setTimeout(r, REDUCED ? 0 : ms));

function criarGlobo() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#050912');
  const camera = new THREE.PerspectiveCamera(38, size.w / size.h, 0.05, 100); camera.position.set(0, 0, 6);
  const g = new THREE.Group(); scene.add(g);
  const rot = { yaw: 0, pitch: 0, vy: 0 }; let dist = 4.1, shift = 0;

  // estrelas
  { const n = 1400, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 30); p.set([v.x, v.y, v.z], i * 3); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: '#8fb4ff', size: 0.09, transparent: true, opacity: 0.7 }))); }

  // corpo, grade e atmosfera
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.994, 64, 64), new THREE.MeshBasicMaterial({ color: '#081226' })));
  { const pts = [];
    for (let la = -60; la <= 60; la += 30) for (let lo = 0; lo < 360; lo += 3) pts.push(xyz(la, lo - 180, 1.001), xyz(la, lo - 177, 1.001));
    for (let lo = 0; lo < 360; lo += 30) for (let la = -87; la < 87; la += 3) pts.push(xyz(la, lo - 180, 1.001), xyz(la + 3, lo - 180, 1.001));
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#7fb0ff', transparent: true, opacity: 0.07 }))); }
  const halo = (r, pot, forca, lado) => new THREE.Mesh(new THREE.SphereGeometry(r, 64, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: lado, blending: THREE.AdditiveBlending,
    uniforms: { c: { value: new THREE.Color('#3fe0c0') }, p: { value: pot }, f: { value: forca } },
    vertexShader: 'varying vec3 n; varying vec3 v; void main(){ n = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.); v = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: `uniform vec3 c; uniform float p; uniform float f; varying vec3 n; varying vec3 v;
      void main(){ float d = ${lado === THREE.BackSide ? 'pow(max(0., -dot(n, v)), p)' : 'pow(1. - max(0., dot(n, v)), p)'}; gl_FragColor = vec4(c, d * f); }` }));
  scene.add(halo(1.22, 3.2, 0.9, THREE.BackSide)); g.add(halo(1.0, 2.6, 0.55, THREE.FrontSide));

  // continentes em pontos, a partir de uma máscara 720x360
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = 720; c.height = 360; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0);
    const px = x.getImageData(0, 0, 720, 360).data; const pos = [], col = []; const a = new THREE.Color('#3fe0c0'), b = new THREE.Color('#7aa8ff'), t = new THREE.Color();
    for (let la = -88; la <= 88; la += 0.82) {
      const n = Math.max(1, Math.round((360 * Math.cos(la * Math.PI / 180)) / 0.82));
      for (let i = 0; i < n; i++) {
        const lo = -180 + (i + 0.5) * (360 / n); const u = Math.floor(((lo + 180) / 360) * 720) % 720, v = Math.min(359, Math.floor(((90 - la) / 180) * 360));
        if (px[(v * 720 + u) * 4] > 128) { const p = xyz(la, lo, 1.002); pos.push(p.x, p.y, p.z); t.lerpColors(a, b, Math.abs(la) / 90 + Math.random() * 0.15); col.push(t.r, t.g, t.b); }
      }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.0105, vertexColors: true, transparent: true, opacity: 0 })); g.add(pts);
    tween(1400, (k) => { pts.material.opacity = 0.95 * k; });
  };
  img.src = 'land.png';

  // marcadores das unidades
  const marks = new THREE.Group(); g.add(marks); const alvos = [];
  function sync() {
    marks.clear(); alvos.length = 0;
    const ps = lugares().filter((p) => p.lat != null).sort((x, y) => x.key.localeCompare(y.key));
    // unidades na mesma cidade caem no mesmo pixel do globo: abre as hastes em leque para cada uma ter o seu ponto
    const perto = (x, y) => Math.abs(x.lat - y.lat) < 2.2 && Math.abs(x.lng - y.lng) < 2.2;
    for (const p of ps) {
      const grupo = ps.filter((q) => perto(p, q)); const i = grupo.indexOf(p), n = grupo.length;
      const cor = new THREE.Color(corDoLugar(p)); const pend = p.itens.some((o) => o.status !== 'resolvida');
      const base = xyz(p.lat, p.lng, 1.004), nrm = base.clone().normalize(); const m = new THREE.Group(); m.position.copy(base); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
      const ang = 0.6 + (i / n) * Math.PI * 2, abre = n > 1 ? 0.07 : 0; const topoPos = new THREE.Vector3(Math.cos(ang) * abre, Math.sin(ang) * abre, 0.115);
      m.add(new THREE.Mesh(new THREE.CircleGeometry(0.008, 20), new THREE.MeshBasicMaterial({ color: cor })));
      m.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), topoPos]), new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: 0.8 })));
      const topo = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 16), new THREE.MeshBasicMaterial({ color: cor })); topo.position.copy(topoPos); m.add(topo);
      const anel = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 40), new THREE.MeshBasicMaterial({ color: cor, transparent: true, side: THREE.DoubleSide, depthWrite: false })); anel.position.set(topoPos.x, topoPos.y, n > 1 ? topoPos.z : 0); anel.userData.fase = Math.random(); anel.userData.pulsa = pend; m.add(anel); m.userData.anel = anel; m.userData.topo = topo; m.userData.key = p.key;
      const hit = new THREE.Mesh(new THREE.SphereGeometry(n > 1 ? 0.035 : 0.06, 8, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.copy(topoPos); hit.userData.place = p; m.add(hit); alvos.push(hit);
      marks.add(m);
    }
  }
  function olharPara(lat, lng) { const p = xyz(lat, lng, 1); return { yaw: -Math.atan2(p.x, p.z), pitch: lat * Math.PI / 180 }; }
  Object.assign(rot, olharPara(-6, -66)); // abre voltado para o Brasil
  async function voarAte(lat, lng, key) {
    const alvo = olharPara(lat, lng); const y0 = rot.yaw, p0 = rot.pitch, d0 = dist; let dy = (alvo.yaw - y0) % (Math.PI * 2);
    if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2; rot.vy = 0; api.livre = false; api.destino = key;
    await tween(1500, (k) => { rot.yaw = y0 + dy * k; rot.pitch = p0 + (alvo.pitch - p0) * k; dist = d0 + (2.5 - d0) * k; });
    await tween(1300, (k) => { dist = 2.5 + (1.16 - 2.5) * k; });
  }
  function tick(dt, t) {
    if (api.livre && !api.arrastando && !REDUCED) rot.yaw += dt * 0.045 + rot.vy; rot.vy *= 0.93;
    rot.pitch = Math.max(-1.2, Math.min(1.2, rot.pitch)); g.rotation.set(rot.pitch, rot.yaw, 0);
    camera.position.z += (dist - camera.position.z) * 0.12;
    const alvoShift = size.w > 860 ? -Math.min(458, size.w * 0.3) / 2 : 0; shift += (alvoShift * (api.livre ? 1 : 0.0) - shift) * 0.08;
    camera.setViewOffset(size.w, size.h, shift, size.w > 860 ? 0 : size.h * 0.2, size.w, size.h);
    for (const m of marks.children) { const a = m.userData.anel; const alvoEsc = api.destino ? (m.userData.key === api.destino ? 1.5 : 0.45) : 1; m.userData.topo.scale.setScalar(m.userData.topo.scale.x + (alvoEsc - m.userData.topo.scale.x) * 0.1); const f = ((t * 0.55 + a.userData.fase) % 1); const s = a.userData.pulsa ? 1 + f * 3.2 : 1.4; a.scale.setScalar(s); a.material.opacity = a.userData.pulsa ? 0.9 * (1 - f) : 0.5; }
  }
  const api = { scene, camera, sync, tick, voarAte, alvos, rot, livre: true, arrastando: false,
    zoom(d) { dist = Math.max(2, Math.min(6, dist + d)); }, reset() { dist = 4.1; api.livre = true; api.destino = null; camera.position.z = 2.4; },
    resize() { camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); } };
  return api;
}
function xyz(lat, lng, r) { const ph = (90 - lat) * Math.PI / 180, th = (lng + 180) * Math.PI / 180; return new THREE.Vector3(-r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)); }

// ---------------------------------------------------------------- gêmeo digital
function criarGemeo() {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#070d1b'); scene.fog = new THREE.Fog('#070d1b', 55, 150);
  const camera = new THREE.PerspectiveCamera(40, size.w / size.h, 0.5, 400);
  const orb = { az: -0.5, pol: 0.92, rad: 43, alvo: new THREE.Vector3(0, 0.6, 3) }; const meta = { az: -0.5, pol: 0.92, rad: 43, alvo: new THREE.Vector3(0, 0.6, 3) };
  let parado = 0;

  scene.add(new THREE.HemisphereLight('#9fc0ff', '#0a1020', 1.15));
  const sol = new THREE.DirectionalLight('#ffe9c9', 2.1); sol.position.set(-18, 30, 22); sol.castShadow = true; sol.shadow.mapSize.set(2048, 2048);
  Object.assign(sol.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 }); sol.shadow.bias = -0.0004; scene.add(sol);
  const brilho = new THREE.PointLight('#3fe0c0', 60, 30); brilho.position.set(0, 5, 7); scene.add(brilho);

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0.05, ...o });
  const M = { chao: mat('#0d1627'), rua: mat('#0a101c'), calcada: mat('#27364f'), laje: mat('#1a2944'), parede: mat('#d7e2f2', { roughness: 0.6 }), movel: mat('#4b6590'),
    cidade: mat('#111c31'), verde: mat('#1f7a63'), tronco: mat('#3a2f2a'), vaga: mat('#17233a'), tatil: new THREE.MeshBasicMaterial({ color: '#ffd84a' }) };
  const linha = new THREE.LineBasicMaterial({ color: '#3fe0c0', transparent: true, opacity: 0.35 });
  function caixa(w, h, d, m, x, y, z, { borda = false, sombra = true, pai = scene } = {}) {
    const geo = new THREE.BoxGeometry(w, h, d); const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = sombra; me.receiveShadow = true; pai.add(me);
    if (borda) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo), linha); me.add(e); } return me;
  }

  // terreno, rua, calçada
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), M.chao); chao.rotation.x = -Math.PI / 2; chao.receiveShadow = true; scene.add(chao);
  const grade = new THREE.GridHelper(200, 100, '#22406b', '#152540'); grade.position.y = 0.01; grade.material.transparent = true; grade.material.opacity = 0.5; scene.add(grade);
  caixa(120, 0.04, 5, M.rua, 0, 0.02, 14.6, { sombra: false });
  for (let x = -56; x < 60; x += 5) caixa(2.2, 0.01, 0.16, new THREE.MeshBasicMaterial({ color: '#40557a' }), x, 0.05, 14.6, { sombra: false });
  caixa(60, 0.12, 3, M.calcada, 0, 0.06, 10.5, { sombra: false });
  caixa(34, 0.02, 0.34, M.tatil, -3, 0.13, 10.5, { sombra: false }); caixa(0.34, 0.02, 1.4, M.tatil, 0, 0.13, 9.6, { sombra: false });

  // estacionamento e vaga acessível
  caixa(11, 0.05, 9.4, M.vaga, -13, 0.03, 4.2, { sombra: false });
  for (const x of [-17, -14, -10, -8.2]) caixa(0.08, 0.01, 4.6, new THREE.MeshBasicMaterial({ color: '#56709c' }), x, 0.07, 3.6, { sombra: false });
  { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#1b62d6'; x.fillRect(0, 0, 256, 256); x.strokeStyle = '#fff'; x.lineWidth = 10; x.strokeRect(8, 8, 240, 240);
    x.fillStyle = '#fff'; x.lineCap = 'round'; x.beginPath(); x.arc(120, 62, 17, 0, 7); x.fill(); x.lineWidth = 15; x.beginPath(); x.moveTo(118, 88); x.lineTo(124, 142); x.lineTo(172, 142); x.lineTo(192, 190); x.stroke();
    x.beginPath(); x.moveTo(122, 112); x.lineTo(160, 112); x.stroke(); x.beginPath(); x.arc(112, 160, 44, 0.5, 4.4); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: t })); s.rotation.x = -Math.PI / 2; s.position.set(-12, 0.075, 4); scene.add(s); }
  caixa(1.9, 0.9, 4, mat('#31466b'), -15.5, 0.75, 3.6); caixa(1.7, 0.6, 2, mat('#22324f'), -15.5, 1.4, 3.4);

  // edifício em corte: laje, paredes e ambientes
  caixa(20, 0.6, 16, M.laje, 4, 0.3, -2, { borda: true });
  const P = (x1, z1, x2, z2, h = 1.5) => { const w = Math.abs(x2 - x1) || 0.2, d = Math.abs(z2 - z1) || 0.2; return caixa(w, h, d, M.parede, (x1 + x2) / 2, 0.6 + h / 2, (z1 + z2) / 2, { borda: true }); };
  P(-6, -10, 14, -10); P(-6, -10, -6, 6); P(14, -10, 14, 6); P(-6, 6, -1.1, 6); P(1.1, 6, 14, 6);
  P(-6, -1, -3, -1); P(-1.5, -1, 3, -1); P(4.5, -1, 9, -1); P(10.5, -1, 14, -1);
  P(5, 1, 8.4, 1); P(9.6, 1, 11.4, 1); P(12.6, 1, 14, 1); P(5, 1, 5, 6); P(10.5, 1, 10.5, 6); P(1, -10, 1, -1); P(7.5, -10, 7.5, -1);
  caixa(3.2, 1, 0.9, M.movel, -3.4, 1.1, 2.2); for (let i = 0; i < 4; i++) caixa(0.6, 0.5, 0.6, M.movel, 1.6 + i * 0.85, 0.85, 5.2);
  for (const [x, z] of [[-3, -6], [4, -6], [11, -6]]) { caixa(2.2, 0.55, 1, mat('#e9f0fa'), x, 0.88, z); caixa(1.2, 0.8, 0.7, M.movel, x + 2, 1, z - 2.5); }
  caixa(1, 0.75, 0.6, mat('#e9f0fa'), 6.2, 0.98, 5.2); caixa(0.7, 0.9, 0.7, mat('#e9f0fa'), 9.4, 1.05, 5.2);
  const elev = caixa(2.3, 3.2, 2.3, new THREE.MeshStandardMaterial({ color: '#3fe0c0', transparent: true, opacity: 0.22, emissive: '#3fe0c0', emissiveIntensity: 0.5 }), 12.2, 2.2, 4.3, { borda: true, sombra: false });

  // rampa, corrimãos, degraus, totem
  const rampa = caixa(2, 0.12, 3.08, mat('#3b5078'), 0, 0.3, 7.5, { borda: true }); rampa.rotation.x = Math.atan2(0.6, 3);
  for (const x of [-1.05, 1.05]) { const c = caixa(0.06, 0.06, 3.08, mat('#cfe0ff', { metalness: 0.6, roughness: 0.3 }), x, 1.1, 7.5); c.rotation.x = Math.atan2(0.6, 3); for (const z of [6.2, 7.5, 8.8]) caixa(0.05, 0.8, 0.05, mat('#cfe0ff'), x, 0.7 + (9 - z) * 0.1, z); }
  for (let i = 0; i < 3; i++) caixa(1.8, 0.2, 0.6, M.calcada, 3, 0.1 + i * 0.2, 8.3 - i * 0.6);
  caixa(0.5, 3.4, 0.5, mat('#16233c'), 5.6, 1.7, 8.2, { borda: true });
  { const m = new THREE.MeshBasicMaterial({ color: '#3fe0c0' }); caixa(1.3, 0.38, 0.12, m, 5.6, 3.9, 8.2, { sombra: false }); caixa(0.38, 1.3, 0.12, m, 5.6, 3.9, 8.2, { sombra: false }); }

  // entorno: quadras vizinhas e árvores
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) { const a = rnd() * Math.PI * 2, r = 34 + rnd() * 50, x = Math.cos(a) * r, z = Math.sin(a) * r - 8; if (z > 6 && Math.abs(x) < 62 && z < 22) continue; const h = 3 + rnd() * 13; caixa(5 + rnd() * 8, h, 5 + rnd() * 8, M.cidade, x, h / 2, z, { borda: rnd() > 0.5, sombra: false }); }
  for (const [x, z] of [[-22, 10.5], [-8.5, 10.6], [9.5, 10.6], [17, 10.4], [24, 10.6], [-19.5, -3], [17.5, -4], [18, 3]]) {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 1.6, 6), M.tronco); tr.position.set(x, 0.8, z); tr.castShadow = true; scene.add(tr);
    const cp = new THREE.Mesh(new THREE.IcosahedronGeometry(1.15, 0), M.verde); cp.position.set(x, 2.3, z); cp.castShadow = true; cp.rotation.y = rnd() * 3; scene.add(cp); }

  // rota acessível: fita luminosa + partículas de fluxo
  const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const principal = [[-16, 0.16, 10.5], [0, 0.16, 10.5], [0, 0.16, 9.1], [0, 0.7, 6], [0, 0.7, 0], [12, 0.7, 0], [12, 0.7, 2.7]].map(V);
  const ramais = [[[9, 0.7, 0], [9, 0.7, 3.2]], [[-12, 0.16, 3.2], [-12, 0.16, 10.5]]].map((r) => r.map(V));
  const rotaMat = new THREE.MeshBasicMaterial({ color: '#3fe0c0', transparent: true, opacity: 0.85 });
  const fita = (pts) => { for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], len = a.distanceTo(b); const s = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.03, len), rotaMat); s.position.copy(a).lerp(b, 0.5); s.lookAt(b); scene.add(s); } };
  fita(principal); ramais.forEach(fita);
  const curva = new THREE.CurvePath(); for (let i = 0; i < principal.length - 1; i++) curva.add(new THREE.LineCurve3(principal[i], principal[i + 1]));
  const fluxo = []; for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 10), new THREE.MeshBasicMaterial({ color: '#b8fff0' })); s.userData.t = i / 9; scene.add(s); fluxo.push(s); }

  // robô de inspeção patrulhando a rota
  const robo = new THREE.Group(); scene.add(robo);
  caixa(0.7, 0.4, 0.9, mat('#eef4ff', { metalness: 0.3, roughness: 0.4 }), 0, 0.42, 0, { pai: robo }); caixa(0.34, 0.26, 0.34, mat('#16233c'), 0, 0.75, 0.15, { pai: robo });
  { const o = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 10), new THREE.MeshBasicMaterial({ color: '#3fe0c0' })); o.position.set(0, 0.76, 0.34); robo.add(o);
    for (const [x, z] of [[-0.38, 0.28], [0.38, 0.28], [-0.38, -0.28], [0.38, -0.28]]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 12), mat('#0b1220')); r.rotation.z = Math.PI / 2; r.position.set(x, 0.18, z); robo.add(r); }
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.2, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#3fe0c0', transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })); cone.rotation.x = -Math.PI / 2; cone.position.set(0, 0.7, 1.5); robo.add(cone); }

  // rótulos fixos dos trechos
  const rotulos = $('labels'); const zonas = Object.entries(ZONES).map(([k, z]) => ({ k, v: V(z.pos).add(new THREE.Vector3(0, 0.1, 0)), n: el('span', { class: 'zone', text: z.nome }) }));

  // marcadores das ocorrências
  const marc = new THREE.Group(); scene.add(marc); const alvos = []; let itens = []; const ocupadas = new Set();
  function sync() {
    marc.clear(); alvos.length = 0; rotulos.replaceChildren(...zonas.map((z) => z.n)); itens = []; ocupadas.clear();
    const p = lugares().find((x) => x.key === state.place); if (!p) return;
    const porZona = {};
    for (const o of p.itens) {
      ocupadas.add(ZONES[o.trecho] ? o.trecho : 'entrada'); const z = ZONES[o.trecho] || ZONES.entrada; const i = (porZona[o.trecho] = (porZona[o.trecho] || 0) + 1) - 1;
      const pos = V(z.pos).add(new THREE.Vector3(i ? Math.cos(i * 2.2) * 1.15 : 0, 0, i ? Math.sin(i * 2.2) * 1.15 : 0)); const cor = new THREE.Color(corDe(o)); const ok = o.status === 'resolvida';
      const g = new THREE.Group(); g.position.copy(pos); marc.add(g);
      const feixe = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4.2, 8, 1, true), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: ok ? 0.25 : 0.55, blending: THREE.AdditiveBlending, depthWrite: false })); feixe.position.y = 2.1; g.add(feixe);
      const gema = new THREE.Mesh(new THREE.OctahedronGeometry(0.36, 0), new THREE.MeshBasicMaterial({ color: cor })); gema.position.y = 4.3; g.add(gema);
      const anel = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 48), new THREE.MeshBasicMaterial({ color: cor, transparent: true, side: THREE.DoubleSide, depthWrite: false })); anel.rotation.x = -Math.PI / 2; anel.position.y = 0.06; g.add(anel);
      if (!ok) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 14), new THREE.MeshStandardMaterial({ color: cor, emissive: cor, emissiveIntensity: 0.6 })); cone.position.y = 0.38; cone.castShadow = true; g.add(cone);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), new THREE.MeshStandardMaterial({ color: '#10192b' })); base.position.y = 0.04; g.add(base); }
      else { const disco = new THREE.Mesh(new THREE.CircleGeometry(0.45, 32), new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.35 })); disco.rotation.x = -Math.PI / 2; disco.position.y = 0.05; g.add(disco); }
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 5, 8), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 2.5; hit.userData.id = o.id; g.add(hit); alvos.push(hit);
      const b = el('button', { type: 'button', style: `--c:${corDe(o)}`, 'aria-label': `${z.nome}: ${o.descricao}. ${ok ? 'Resolvida' : 'Pendente'}`, text: z.nome, onclick: () => selecionar(o.id) }); rotulos.append(b);
      itens.push({ o, g, gema, anel, b, ok, fase: Math.random(), topo: pos.clone().add(new THREE.Vector3(0, 5.1, 0)) });
    }
    pintarLado(p);
  }
  function focar(id) { const it = itens.find((x) => x.o.id === id); if (!it) { meta.alvo.set(0, 0.6, 3); meta.rad = 43; return; } meta.alvo.copy(it.g.position).add(new THREE.Vector3(0, 1.2, 0)); meta.rad = 27; parado = 0; }
  async function entrar() {
    Object.assign(meta, { az: -0.5, pol: 0.92, rad: 43 }); meta.alvo.set(0, 0.6, 3); orb.alvo.copy(meta.alvo); orb.az = -1.5; orb.pol = 0.12; orb.rad = 130; parado = 0;
    await tween(2300, (k) => { orb.az = -1.5 + (meta.az + 1.5) * k; orb.pol = 0.12 + (meta.pol - 0.12) * k; orb.rad = 130 + (meta.rad - 130) * k; });
  }
  const proj = new THREE.Vector3();
  function colar(n, v, dy = 0) { proj.copy(v).project(camera); const vis = proj.z < 1 && Math.abs(proj.x) < 1.15 && Math.abs(proj.y) < 1.15; n.style.opacity = vis ? '' : '0'; n.style.pointerEvents = vis ? '' : 'none';
    n.style.transform = `translate(-50%,-50%) translate(${((proj.x * 0.5 + 0.5) * size.w).toFixed(1)}px,${((-proj.y * 0.5 + 0.5) * size.h + dy).toFixed(1)}px)`; }
  let tr = 0, dir = 1;
  function tick(dt, t) {
    parado += dt; if (parado > 4 && !REDUCED && !tweens.size) meta.az += dt * 0.035;
    if (!tweens.size) { orb.az += (meta.az - orb.az) * 0.09; orb.pol += (meta.pol - orb.pol) * 0.09; orb.rad += (meta.rad - orb.rad) * 0.07; }
    orb.alvo.lerp(meta.alvo, 0.07);
    camera.position.set(orb.alvo.x + orb.rad * Math.sin(orb.pol) * Math.sin(orb.az), orb.alvo.y + orb.rad * Math.cos(orb.pol), orb.alvo.z + orb.rad * Math.sin(orb.pol) * Math.cos(orb.az)); camera.lookAt(orb.alvo);
    camera.setViewOffset(size.w, size.h, size.w > 860 ? 170 : 0, size.w > 860 ? 0 : size.h * 0.16, size.w, size.h);
    for (const s of fluxo) { s.userData.t = (s.userData.t + dt * 0.035) % 1; curva.getPointAt(s.userData.t, s.position); s.position.y += 0.12; }
    if (!REDUCED) { tr += dt * 0.022 * dir; if (tr > 1) { tr = 1; dir = -1; } if (tr < 0) { tr = 0; dir = 1; } }
    curva.getPointAt(tr, robo.position); const adiante = curva.getPointAt(Math.max(0, Math.min(1, tr + 0.01 * dir))); if (adiante.distanceToSquared(robo.position) > 1e-6) robo.lookAt(adiante.x, robo.position.y, adiante.z);
    elev.material.emissiveIntensity = 0.45 + Math.sin(t * 2) * 0.2;
    for (const it of itens) { const f = (t * 0.6 + it.fase) % 1; it.gema.rotation.y = t * 1.4; it.gema.position.y = 4.3 + Math.sin(t * 2 + it.fase * 6) * 0.14;
      const sel = state.selected === it.o.id; it.gema.scale.setScalar(sel ? 1.5 : 1);
      if (it.ok) { it.anel.scale.setScalar(1); it.anel.material.opacity = 0.6; } else { it.anel.scale.setScalar(1 + f * 2.4); it.anel.material.opacity = 0.9 * (1 - f); }
      colar(it.b, it.topo); it.b.classList.toggle('sel', sel); }
    for (const z of zonas) { if (ocupadas.has(z.k)) z.n.style.opacity = '0'; else colar(z.n, z.v, 16); }
  }
  return { scene, camera, sync, tick, entrar, focar, alvos,
    girar(dx, dy) { meta.az -= dx * 0.005; meta.pol = Math.max(0.2, Math.min(1.45, meta.pol - dy * 0.004)); parado = 0; },
    zoom(d) { meta.rad = Math.max(12, Math.min(70, meta.rad * (1 + d))); parado = 0; },
    resize() { camera.aspect = size.w / size.h; camera.updateProjectionMatrix(); } };
}

// ---------------------------------------------------------------- painel do gêmeo
function pintarLado(p) {
  $('tw-name').textContent = p.nome; $('tw-addr').textContent = p.endereco || 'Endereço não informado';
  const pend = p.itens.filter((o) => o.status !== 'resolvida'); $('tw-pend').textContent = pend.length; $('tw-res').textContent = p.itens.length - pend.length;
  const rs = $('tw-route'); rs.className = `route-state ${pend.length ? 'blocked' : 'free'}`;
  rs.textContent = pend.length ? `Rota acessível com ${pend.length} bloqueio${pend.length > 1 ? 's' : ''}` : 'Rota acessível livre';
  const ul = $('tw-list'); ul.replaceChildren();
  const ord = [...p.itens].sort((a, b) => (a.status === 'resolvida') - (b.status === 'resolvida') || new Date(b.criada_em) - new Date(a.criada_em));
  for (const o of ord) ul.append(el('li', {}, el('button', { type: 'button', style: `--c:${corDe(o)}`, class: o.status === 'resolvida' ? 'done' : '', 'aria-pressed': String(state.selected === o.id), onclick: () => selecionar(o.id) },
    el('span', { class: 'dot' }), el('span', { class: 'z', text: (ZONES[o.trecho] || ZONES.entrada).nome }), el('span', { class: 'd', text: o.descricao }))));
  const d = $('tw-detail'); const o = p.itens.find((x) => x.id === state.selected);
  if (!o) { d.hidden = true; return; }
  const ok = o.status === 'resolvida'; d.hidden = false; d.style.setProperty('--c', corDe(o));
  d.replaceChildren(
    el('h4', { text: (ZONES[o.trecho] || ZONES.entrada).nome }), el('p', { class: 'desc', text: o.descricao }),
    el('dl', {}, el('dt', { text: 'Status' }), el('dd', {}, el('span', { class: 'tag', text: ok ? 'Resolvida' : 'Pendente' })),
      el('dt', { text: 'Gravidade' }), el('dd', { text: SEV_NOME[o.gravidade] || 'Média' }),
      el('dt', { text: 'Detectada por' }), el('dd', { text: ORIGEM[o.origem] || 'Registro manual' }),
      el('dt', { text: 'Registrada' }), el('dd', { text: haQuanto(o.criada_em) }),
      ok && o.resolvida_em ? el('dt', { text: 'Resolvida' }) : null, ok && o.resolvida_em ? el('dd', { text: haQuanto(o.resolvida_em) }) : null),
    ok ? null : el('button', { class: 'resolve', type: 'button', text: 'Marcar como resolvida', onclick: async (e) => {
      e.target.disabled = true; e.target.textContent = 'Atualizando…';
      try { const r = await fetch(`${API}/ocorrencias/${encodeURIComponent(o.id)}/resolver`, { method: 'PATCH' }); if (!r.ok) throw new Error(r.status); await carregar(); }
      catch { e.target.disabled = false; e.target.textContent = 'Não deu certo. Tentar de novo'; } } }));
}
function selecionar(id) {
  state.selected = state.selected === id ? null : id; twin.focar(state.selected);
  const p = lugares().find((x) => x.key === state.place); if (p) pintarLado(p);
}

// ---------------------------------------------------------------- navegação entre as visões
async function viajar(key, selecionarId = null) {
  const p = lugares().find((x) => x.key === key); if (!p || state.mode !== 'globe' || state.viajando) return; state.viajando = true;
  const veu = $('veil'), vg = $('view-globe'), vt = $('view-twin');
  if (!gl) { state.place = key; state.selected = selecionarId; vg.hidden = true; vt.hidden = false; pintarLado(p); state.mode = 'twin'; state.viajando = false; return; }
  $('tip').hidden = true; vg.classList.add('leaving');
  if (p.lat != null) await globe.voarAte(p.lat, p.lng, p.key);
  $('veil-text').replaceChildren(document.createTextNode(p.nome), el('small', { text: 'Carregando o gêmeo digital do local' })); veu.classList.add('on'); await esperar(600);
  state.place = key; state.selected = null; state.mode = 'twin'; vg.hidden = true; vg.classList.remove('leaving'); vt.hidden = false; twin.sync(); canvas.style.cursor = '';
  veu.classList.remove('on'); await twin.entrar();
  if (selecionarId) selecionar(selecionarId);
  state.viajando = false; $('back').focus({ preventScroll: true });
}
async function voltar() {
  if (state.mode !== 'twin' || state.viajando) return; state.viajando = true; const veu = $('veil');
  $('veil-text').replaceChildren(document.createTextNode('Voltando ao globo')); if (gl) { veu.classList.add('on'); await esperar(500); }
  state.mode = 'globe'; state.place = null; state.selected = null; $('labels').replaceChildren(); $('view-twin').hidden = true; $('view-globe').hidden = false;
  if (gl) { globe.reset(); globe.sync(); veu.classList.remove('on'); } state.viajando = false; $('f-local').focus({ preventScroll: true });
}

// ---------------------------------------------------------------- entrada do usuário e laço de desenho
function ligarPonteiro() {
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let baixo = null, moveu = 0; const dedos = new Map(); let pinca = 0;
  const acertar = (ev) => { ndc.set((ev.clientX / size.w) * 2 - 1, -(ev.clientY / size.h) * 2 + 1); const v = state.mode === 'globe' ? globe : twin; ray.setFromCamera(ndc, v.camera); const h = ray.intersectObjects(v.alvos, false)[0];
    if (h && state.mode === 'globe') { const c = h.object.getWorldPosition(new THREE.Vector3()); if (c.clone().sub(v.camera.position).dot(c) > 0) return null; } return h ? h.object : null; };
  canvas.addEventListener('pointerdown', (e) => { if (state.viajando) return; dedos.set(e.pointerId, e); baixo = { x: e.clientX, y: e.clientY }; moveu = 0; canvas.setPointerCapture(e.pointerId); canvas.classList.add('grabbing'); if (state.mode === 'globe') globe.arrastando = true; });
  canvas.addEventListener('pointermove', (e) => {
    if (state.viajando) return;
    if (dedos.size === 2 && dedos.has(e.pointerId)) { dedos.set(e.pointerId, e); const [a, b] = [...dedos.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); if (pinca) (state.mode === 'globe' ? globe.zoom((pinca - d) * 0.01) : twin.zoom((pinca - d) * 0.004)); pinca = d; return; }
    if (baixo) { const dx = e.clientX - baixo.x, dy = e.clientY - baixo.y; moveu += Math.abs(dx) + Math.abs(dy); baixo = { x: e.clientX, y: e.clientY };
      if (state.mode === 'globe') { globe.rot.yaw += dx * 0.005; globe.rot.pitch += dy * 0.005; globe.rot.vy = dx * 0.0012; } else twin.girar(dx, dy); return; }
    const alvo = acertar(e); canvas.classList.toggle('pointing', !!alvo); const tip = $('tip');
    if (alvo && state.mode === 'globe') { const p = alvo.userData.place; const n = p.itens.filter((o) => o.status !== 'resolvida').length; tip.textContent = `${p.nome} · ${n ? `${n} pendente${n > 1 ? 's' : ''}` : 'rota livre'}`; tip.style.left = `${e.clientX}px`; tip.style.top = `${e.clientY}px`; tip.hidden = false; } else tip.hidden = true;
  });
  const soltar = (e) => { dedos.delete(e.pointerId); pinca = 0; canvas.classList.remove('grabbing'); globe.arrastando = false; if (!baixo) return; baixo = null;
    if (moveu < 6 && !state.viajando) { const alvo = acertar(e); if (alvo) (state.mode === 'globe' ? viajar(alvo.userData.place.key) : selecionar(alvo.userData.id)); } };
  canvas.addEventListener('pointerup', soltar); canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (state.viajando) return; if (state.mode === 'globe') globe.zoom(e.deltaY * 0.0015); else twin.zoom(e.deltaY * 0.0009); }, { passive: false });
}
function iniciar3D() {
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch { return false; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(size.w, size.h, false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  clock = new THREE.Clock(); globe = criarGlobo(); twin = criarGemeo(); gl = true; ligarPonteiro();
  addEventListener('resize', () => { size.w = innerWidth; size.h = innerHeight; renderer.setSize(size.w, size.h, false); globe.resize(); twin.resize(); });
  renderer.setAnimationLoop(() => { const dt = Math.min(clock.getDelta(), 0.05), t = clock.elapsedTime; for (const tw of [...tweens]) tw(); const v = state.mode === 'globe' ? globe : twin; v.tick(dt, t); renderer.render(v.scene, v.camera); });
  return true;
}

// ---------------------------------------------------------------- partida
montarFormulario();
if (!iniciar3D()) { canvas.hidden = true; $('form-status').textContent = 'Seu navegador não abriu o modo 3D. O registro e a lista continuam funcionando.'; }
$('back').addEventListener('click', voltar);
addEventListener('keydown', (e) => { if (e.key === 'Escape' && state.mode === 'twin') { if (state.selected) selecionar(state.selected); else voltar(); } });
carregar().catch(() => { $('form-status').className = 'err'; $('form-status').textContent = 'Sem conexão com a API no momento.'; });
setInterval(() => { if (!state.busy && !state.viajando && !document.hidden) carregar().catch(() => {}); }, 30000);
