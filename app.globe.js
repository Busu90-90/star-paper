import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ROOT_ID = 'globalScheduleGlobe';
const STAGE_ID = 'globalScheduleStage';
const ITINERARY_ID = 'globalScheduleItinerary';
const DETAIL_ID = 'globalScheduleDetail';
const RADIUS = 2.15;
const WORLD_ATLAS_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';
const TOPOJSON_CLIENT_URL = 'https://cdn.jsdelivr.net/npm/topojson-client@3.1.0/+esm';
const isReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;

const LOCATION_COORDS = {
  Kampala: { lat: 0.3476, lng: 32.5825, label: 'Kampala, UG' },
  Wakiso: { lat: 0.4044, lng: 32.4594, label: 'Wakiso, UG' },
  Mukono: { lat: 0.3533, lng: 32.7553, label: 'Mukono, UG' },
  Entebbe: { lat: 0.0512, lng: 32.4637, label: 'Entebbe, UG' },
  Jinja: { lat: 0.4479, lng: 33.2026, label: 'Jinja, UG' },
  Mbale: { lat: 1.0806, lng: 34.1750, label: 'Mbale, UG' },
  Gulu: { lat: 2.7746, lng: 32.2990, label: 'Gulu, UG' },
  Lira: { lat: 2.2499, lng: 32.8999, label: 'Lira, UG' },
  Mbarara: { lat: -0.6072, lng: 30.6545, label: 'Mbarara, UG' },
  Masaka: { lat: -0.3411, lng: 31.7367, label: 'Masaka, UG' },
  Soroti: { lat: 1.7150, lng: 33.6111, label: 'Soroti, UG' },
  Hoima: { lat: 1.4319, lng: 31.3525, label: 'Hoima, UG' },
  Arua: { lat: 3.0201, lng: 30.9111, label: 'Arua, UG' },
  Kabale: { lat: -1.2495, lng: 29.9899, label: 'Kabale, UG' },
  'Fort Portal': { lat: 0.6710, lng: 30.2750, label: 'Fort Portal, UG' },
  Kasese: { lat: 0.1868, lng: 30.0880, label: 'Kasese, UG' },
  Tororo: { lat: 0.6928, lng: 34.1809, label: 'Tororo, UG' },
  Busia: { lat: 0.4659, lng: 34.0922, label: 'Busia, UG' },
  Uganda: { lat: 1.3733, lng: 32.2903, label: 'Uganda' },
  Nigeria: { lat: 9.0820, lng: 8.6753, label: 'Nigeria' },
  Kenya: { lat: -0.0236, lng: 37.9062, label: 'Kenya' },
  Tanzania: { lat: -6.3690, lng: 34.8888, label: 'Tanzania' },
  Rwanda: { lat: -1.9403, lng: 29.8739, label: 'Rwanda' },
  'South Africa': { lat: -30.5595, lng: 22.9375, label: 'South Africa' },
  Ghana: { lat: 7.9465, lng: -1.0232, label: 'Ghana' },
  'United Kingdom': { lat: 51.5072, lng: -0.1276, label: 'London, UK' },
  'United States': { lat: 40.7128, lng: -74.0060, label: 'New York, US' },
  Canada: { lat: 43.6532, lng: -79.3832, label: 'Toronto, CA' },
  France: { lat: 48.8566, lng: 2.3522, label: 'Paris, FR' },
  Germany: { lat: 52.5200, lng: 13.4050, label: 'Berlin, DE' },
  'Dubai (UAE)': { lat: 25.2048, lng: 55.2708, label: 'Dubai, AE' },
  'South Sudan': { lat: 4.8594, lng: 31.5713, label: 'Juba, SS' },
  'Congo (DRC)': { lat: -4.4419, lng: 15.2663, label: 'Kinshasa, DRC' },
  Burundi: { lat: -3.3614, lng: 29.3599, label: 'Burundi' },
  Ethiopia: { lat: 9.1450, lng: 40.4897, label: 'Ethiopia' },
  Egypt: { lat: 26.8206, lng: 30.8025, label: 'Egypt' },
  Morocco: { lat: 31.7917, lng: -7.0926, label: 'Morocco' },
  Senegal: { lat: 14.4974, lng: -14.4524, label: 'Senegal' },
  'Ivory Coast': { lat: 7.5400, lng: -5.5471, label: 'Ivory Coast' },
  Netherlands: { lat: 52.3676, lng: 4.9041, label: 'Amsterdam, NL' },
  Belgium: { lat: 50.8503, lng: 4.3517, label: 'Brussels, BE' },
  Sweden: { lat: 59.3293, lng: 18.0686, label: 'Stockholm, SE' },
  Australia: { lat: -33.8688, lng: 151.2093, label: 'Sydney, AU' },
  India: { lat: 28.6139, lng: 77.2090, label: 'Delhi, IN' },
  China: { lat: 39.9042, lng: 116.4074, label: 'Beijing, CN' },
  Japan: { lat: 35.6762, lng: 139.6503, label: 'Tokyo, JP' },
  Brazil: { lat: -23.5558, lng: -46.6396, label: 'Sao Paulo, BR' },
  Argentina: { lat: -34.6037, lng: -58.3816, label: 'Buenos Aires, AR' },
  Mexico: { lat: 19.4326, lng: -99.1332, label: 'Mexico City, MX' },
  Spain: { lat: 40.4168, lng: -3.7038, label: 'Madrid, ES' },
  Italy: { lat: 41.9028, lng: 12.4964, label: 'Rome, IT' },
  Portugal: { lat: 38.7223, lng: -9.1393, label: 'Lisbon, PT' },
  Switzerland: { lat: 46.2044, lng: 6.1432, label: 'Geneva, CH' },
};

const LAND_POLYGONS = [
  { name: 'North America', points: [[-168,72],[-145,70],[-126,61],[-112,56],[-96,52],[-82,47],[-66,44],[-58,52],[-72,59],[-86,66],[-104,71],[-122,73],[-145,74]] },
  { name: 'United States', points: [[-125,49],[-111,50],[-96,49],[-82,45],[-67,44],[-80,30],[-97,25],[-114,31],[-124,39]] },
  { name: 'Mexico Central America', points: [[-117,32],[-104,25],[-96,19],[-87,18],[-80,10],[-77,8],[-85,6],[-94,15],[-108,21],[-117,28]] },
  { name: 'Greenland', points: [[-73,83],[-52,84],[-31,79],[-22,70],[-37,60],[-53,61],[-68,70]] },
  { name: 'South America', points: [[-82,12],[-68,10],[-52,3],[-41,-11],[-45,-24],[-52,-35],[-60,-52],[-70,-55],[-75,-35],[-81,-18],[-78,-4]] },
  { name: 'Africa', points: [[-18,36],[-5,35],[14,33],[32,31],[43,12],[51,-2],[40,-17],[31,-34],[18,-35],[7,-29],[-5,-18],[-15,-3],[-17,17]] },
  { name: 'Europe', points: [[-11,36],[5,43],[20,45],[31,55],[43,57],[39,68],[17,71],[-2,59],[-10,49]] },
  { name: 'Asia West', points: [[30,36],[48,39],[62,50],[90,57],[116,58],[138,51],[151,43],[136,31],[111,23],[95,7],[75,8],[64,22],[44,26]] },
  { name: 'Asia East', points: [[94,8],[113,20],[130,18],[146,10],[151,-3],[137,-9],[121,-4],[109,4]] },
  { name: 'India', points: [[68,25],[81,25],[90,20],[85,8],[78,6],[72,15]] },
  { name: 'Arabia', points: [[35,31],[51,27],[58,18],[53,12],[44,12],[36,22]] },
  { name: 'Southeast Asia', points: [[96,17],[107,18],[110,9],[104,0],[96,5]] },
  { name: 'Indonesia', points: [[95,5],[118,3],[138,-4],[126,-10],[104,-7]] },
  { name: 'Japan', points: [[130,43],[144,42],[146,35],[138,32],[132,37]] },
  { name: 'Australia', points: [[113,-12],[130,-10],[153,-25],[147,-39],[126,-43],[113,-31]] },
  { name: 'Madagascar', points: [[48,-12],[51,-18],[50,-25],[45,-24],[44,-17]] },
  { name: 'United Kingdom', points: [[-8,59],[1,58],[2,51],[-5,50]] },
  { name: 'Antarctica', points: [[-180,-72],[-120,-70],[-60,-73],[0,-71],[62,-73],[122,-70],[180,-72],[180,-86],[-180,-86]] },
];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
  }[char]));
}

function fmtDate(value) {
  if (typeof window.formatDisplayDate === 'function') return window.formatDisplayDate(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date TBC' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMoney(value) {
  const amount = Math.round(Number(value) || 0);
  if (typeof window.SP_formatCurrency === 'function') return window.SP_formatCurrency(amount);
  return `UGX ${amount.toLocaleString()}`;
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeLocationName(value) {
  return normalizeKey(value)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactLocationName(value) {
  return normalizeLocationName(value).replace(/\s+/g, '');
}

const LOCATION_ALIASES = {
  ug: 'Uganda',
  uga: 'Uganda',
  uganda: 'Uganda',
  kla: 'Kampala',
  kampalacity: 'Kampala',
  mbararacity: 'Mbarara',
  entebbeairport: 'Entebbe',
  uk: 'United Kingdom',
  gb: 'United Kingdom',
  usa: 'United States',
  us: 'United States',
  uae: 'Dubai (UAE)',
  dubaiuae: 'Dubai (UAE)',
  drc: 'Congo (DRC)',
  congo: 'Congo (DRC)',
  ivorycoast: 'Ivory Coast',
};

function resolveLocationCandidate(value) {
  const normalized = normalizeLocationName(value);
  if (!normalized) return null;
  const compact = compactLocationName(normalized);
  const aliasKey = LOCATION_ALIASES[compact];
  if (aliasKey && LOCATION_COORDS[aliasKey]) return aliasKey;

  const keys = Object.keys(LOCATION_COORDS);
  const exact = keys.find((key) => compactLocationName(key) === compact || compactLocationName(LOCATION_COORDS[key].label) === compact);
  if (exact) return exact;

  if (normalized.length < 4) return null;
  return keys.find((key) => {
    const keyName = normalizeLocationName(key);
    const keyLabel = normalizeLocationName(LOCATION_COORDS[key].label);
    return normalized.includes(keyName) ||
      keyName.includes(normalized) ||
      normalized.includes(keyLabel) ||
      keyLabel.includes(normalized);
  }) || null;
}

function getLocationInfo(booking = {}) {
  const raw = String(booking.location || '').trim();
  const candidates = [];
  const addCandidate = (value) => {
    const text = String(value || '').trim();
    if (text && !candidates.includes(text)) candidates.push(text);
  };

  addCandidate(raw);
  addCandidate(booking.city);
  addCandidate(booking.country);
  addCandidate(booking.venue);
  addCandidate(booking.event);
  raw.split(/[,;/|]+/).forEach(addCandidate);
  raw.split(/\s+-\s+|\s+at\s+|\s+in\s+/i).forEach(addCandidate);
  addCandidate(raw.replace(/\b(ug|uga|uganda)\b/gi, '').replace(/[,;/|]+/g, ' ').trim());

  const foundKey = candidates.map(resolveLocationCandidate).find(Boolean);
  if (foundKey) return { ...LOCATION_COORDS[foundKey], raw, approximate: false };
  return {
    lat: 0.3476,
    lng: 32.5825,
    label: raw ? `${raw} (approx.)` : 'East Africa (approx.)',
    raw: raw || 'Unknown',
    approximate: true,
  };
}

function isPastBooking(booking) {
  const status = normalizeKey(booking.status);
  if (status === 'completed') return true;
  if (status === 'cancelled') return false;
  const date = new Date(booking.date);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function normalizeBookings(input) {
  const source = Array.isArray(input) ? input : (Array.isArray(window.bookings) ? window.bookings : []);
  return source
    .filter((booking) => booking && booking.date && normalizeKey(booking.status) !== 'cancelled')
    .map((booking, index) => {
      const loc = getLocationInfo(booking);
      return {
        ...booking,
        __index: index,
        __location: loc,
        __past: isPastBooking(booking),
        __vector: latLngToVector(loc.lat, loc.lng, RADIUS + 0.035),
      };
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

function latLngToVector(lat, lng, radius = RADIUS) {
  const phi = THREE.MathUtils.degToRad(90 - lat);
  const theta = THREE.MathUtils.degToRad(lng);
  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.sin(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.cos(theta)
  );
}

function getShapeRings(shape) {
  if (Array.isArray(shape.rings)) return shape.rings;
  if (Array.isArray(shape.points)) return [shape.points];
  return [];
}

function shapeBounds(rings) {
  const points = rings.flat();
  return points.reduce((bounds, point) => ({
    minLng: Math.min(bounds.minLng, point[0]),
    maxLng: Math.max(bounds.maxLng, point[0]),
    minLat: Math.min(bounds.minLat, point[1]),
    maxLat: Math.max(bounds.maxLat, point[1]),
  }), { minLng: 180, maxLng: -180, minLat: 90, maxLat: -90 });
}

function prepareLandShape(shape) {
  const rings = getShapeRings(shape);
  return {
    ...shape,
    rings,
    bounds: shape.bounds || shapeBounds(rings),
  };
}

function makeDiscTexture(color = '#d4a843', fill = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(48, 48, 2, 48, 48, 46);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.45, color);
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient;
  ctx.globalAlpha = fill;
  ctx.beginPath();
  ctx.arc(48, 48, 46, 0, Math.PI * 2);
  ctx.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function projectLngLat(lng, lat, width, height) {
  return [
    ((lng + 180) / 360) * width,
    ((90 - lat) / 180) * height,
  ];
}

function drawProjectedPolygon(ctx, points, width, height) {
  points.forEach(([lng, lat], index) => {
    const [x, y] = projectLngLat(lng, lat, width, height);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function makeLandTexture(landShapes = FALLBACK_LAND_SHAPES) {
  const width = 2048;
  const height = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  const fill = ctx.createLinearGradient(0, 0, width, height);
  fill.addColorStop(0, 'rgba(210, 170, 72, 0.88)');
  fill.addColorStop(0.52, 'rgba(214, 209, 196, 0.78)');
  fill.addColorStop(1, 'rgba(126, 116, 94, 0.82)');

  ctx.save();
  ctx.shadowColor = 'rgba(255, 203, 92, 0.42)';
  ctx.shadowBlur = 14;
  landShapes.forEach((shape) => {
    ctx.beginPath();
    getShapeRings(shape).forEach((ring) => drawProjectedPolygon(ctx, ring, width, height));
    ctx.fillStyle = fill;
    ctx.fill('evenodd');
  });
  ctx.restore();

  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(232, 225, 207, 0.72)';
  ctx.lineWidth = 2.2;
  landShapes.forEach((shape) => {
    ctx.beginPath();
    getShapeRings(shape).forEach((ring) => drawProjectedPolygon(ctx, ring, width, height));
    ctx.stroke();
  });
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

async function loadWorldLandShapes() {
  const [{ feature }, response] = await Promise.all([
    import(TOPOJSON_CLIENT_URL),
    fetch(WORLD_ATLAS_URL, { cache: 'force-cache' }),
  ]);
  if (!response.ok) throw new Error(`World map unavailable (${response.status})`);
  const topology = await response.json();
  const geo = feature(topology, topology.objects.land);
  const features = geo.type === 'FeatureCollection' ? geo.features : [geo];
  const shapes = [];
  features.forEach((entry, featureIndex) => {
    const geometry = entry.geometry;
    if (!geometry) return;
    const polygons = geometry.type === 'Polygon'
      ? [geometry.coordinates]
      : geometry.type === 'MultiPolygon'
        ? geometry.coordinates
        : [];
    polygons.forEach((rings, polygonIndex) => {
      const cleanRings = rings
        .map((ring) => ring
          .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]))
          .map((point) => [point[0], point[1]]))
        .filter((ring) => ring.length >= 3);
      if (cleanRings.length) {
        shapes.push(prepareLandShape({
          name: `world-land-${featureIndex}-${polygonIndex}`,
          rings: cleanRings,
        }));
      }
    });
  });
  return shapes.length ? shapes : FALLBACK_LAND_SHAPES;
}

const FALLBACK_LAND_SHAPES = LAND_POLYGONS.map(prepareLandShape);

function buildStarGeometry() {
  const positions = [];
  const colors = [];
  for (let i = 0; i < 900; i += 1) {
    const radius = 9 + Math.random() * 8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    positions.push(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
    const warmth = Math.random();
    colors.push(0.55 + warmth * 0.45, 0.78 + warmth * 0.18, 0.82);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

class StarPaperGlobe {
  constructor(root) {
    this.root = root;
    this.stage = document.getElementById(STAGE_ID);
    this.itinerary = document.getElementById(ITINERARY_ID);
    this.detail = document.getElementById(DETAIL_ID);
    this.bookings = [];
    this.pinSprites = [];
    this.arcLines = [];
    this.activeCurve = null;
    this.autoTourTimer = null;
    this.selectedIndex = 0;
    this.running = true;
    this.targetDistance = null;
    this.focusAnimation = null;
    this.focusHoldUntil = 0;
    this.defaultDistance = 8.05;
    this.previewIndex = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.pickWorld = new THREE.Vector3();
    this.focusTargetWorld = new THREE.Vector3();
    this.init();
  }

  init() {
    if (!this.stage || !this.hasWebGL()) throw new Error('WebGL is not available.');
    this.root.classList.remove('sp-global-schedule--fallback');
    this.defaultDistance = window.innerWidth < 720 ? 8.65 : 8.05;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
    this.camera.position.set(0, 0.08, this.defaultDistance);
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, window.innerWidth < 720 ? 1.35 : 1.75));
    this.renderer.setClearColor(0x020406, 0);
    this.stage.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.095;
    this.controls.enablePan = false;
    this.controls.minDistance = window.innerWidth < 720 ? 6.2 : 5.6;
    this.controls.maxDistance = 10.2;
    this.controls.rotateSpeed = 0.44;
    this.controls.zoomSpeed = 0.55;
    this.controls.autoRotate = false;
    this.controls.addEventListener('start', () => this.cancelFocusAnimation());

    this.globeGroup = new THREE.Group();
    this.scene.add(this.globeGroup);

    const earthShell = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 0.992, 64, 32),
      new THREE.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.86 })
    );
    this.globeGroup.add(earthShell);

    this.landTexture = makeLandTexture();
    this.landSurface = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.006, 128, 64),
      new THREE.MeshBasicMaterial({
        map: this.landTexture,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    );
    this.landSurface.rotation.y = -Math.PI / 2;
    this.globeGroup.add(this.landSurface);

    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.026, 96, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          glowColor: { value: new THREE.Color('#d8d2c4') },
        },
        vertexShader: 'varying vec3 vNormal; void main(){ vNormal = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 glowColor; varying vec3 vNormal; void main(){ float intensity = pow(0.58 - dot(vNormal, vec3(0.0,0.0,1.0)), 2.85); gl_FragColor = vec4(glowColor, clamp(intensity, 0.0, 0.22)); }',
      })
    );
    this.globeGroup.add(halo);

    this.scene.add(new THREE.Points(
      buildStarGeometry(),
      new THREE.PointsMaterial({
        size: 0.026,
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true,
        depthWrite: false,
      })
    ));

    this.pinTextureUpcoming = makeDiscTexture('#d4a843', 1);
    this.pinTexturePast = makeDiscTexture('#a49b8d', 0.78);
    this.pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.038, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffcf5a, transparent: true, opacity: 0.86 })
    );
    this.pulse.visible = false;
    this.globeGroup.add(this.pulse);

    this.bindEvents();
    this.pinCard = this.createPinCard();
    this.resize();
    this.render(window.bookings || []);
    this.loadDetailedLand();
    this.animate();
  }

  async loadDetailedLand() {
    try {
      const landShapes = await loadWorldLandShapes();
      const nextTexture = makeLandTexture(landShapes);
      this.landSurface.material.map?.dispose?.();
      this.landSurface.material.map = nextTexture;
      this.landSurface.material.needsUpdate = true;
    } catch (err) {
      console.warn('[StarPaper Globe] Using built-in continent fallback:', err);
    }
  }

  hasWebGL() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(window.WebGL2RenderingContext && canvas.getContext('webgl2'));
    } catch (_err) {
      return false;
    }
  }

  bindEvents() {
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.root);
    document.addEventListener('visibilitychange', () => {
      this.running = !document.hidden;
      if (this.running) this.animate();
    });
    this.stage.addEventListener('click', (event) => this.pick(event));
    this.stage.addEventListener('pointermove', (event) => this.previewPin(event));
    this.stage.addEventListener('pointerleave', () => this.hidePinCard());
    this.root.addEventListener('click', (event) => {
      const action = event.target.closest('[data-globe-action]')?.dataset.globeAction;
      if (!action) return;
      if (action === 'auto-tour') this.toggleAutoTour();
      if (action === 'recenter') this.resetView();
      if (action === 'zoom-in') this.zoomBy(-0.6);
      if (action === 'zoom-out') this.zoomBy(0.6);
    });
  }

  createPinCard() {
    const card = document.createElement('div');
    card.className = 'sp-global-pin-card';
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
    this.root.appendChild(card);
    return card;
  }

  resize() {
    if (!this.renderer || !this.stage) return;
    const rect = this.stage.getBoundingClientRect();
    const width = Math.max(280, rect.width || this.root.clientWidth || 640);
    const height = Math.max(360, rect.height || this.root.clientHeight || 540);
    const mobile = width < 560;
    this.defaultDistance = mobile ? 8.75 : 8.05;
    this.controls.minDistance = mobile ? 6.25 : 5.6;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    if (this.camera.position.length() < this.controls.minDistance) {
      this.camera.position.setLength(this.controls.minDistance);
    }
  }

  render(inputBookings = window.bookings || []) {
    this.bookings = normalizeBookings(inputBookings);
    this.clearPinsAndArcs();
    this.renderItinerary();
    this.buildPins();
    this.buildArcs();
    if (this.bookings.length > 0) {
      this.selectBooking(Math.min(this.selectedIndex, this.bookings.length - 1), { fly: false });
    } else {
      this.renderEmptyDetail();
    }
  }

  clearPinsAndArcs() {
    this.pinSprites.forEach((pin) => {
      this.globeGroup.remove(pin);
      pin.material?.dispose?.();
    });
    this.arcLines.forEach((line) => {
      this.globeGroup.remove(line);
      line.geometry?.dispose?.();
      line.material?.dispose?.();
    });
    this.pinSprites = [];
    this.arcLines = [];
    this.activeCurve = null;
    this.pulse.visible = false;
  }

  buildPins() {
    this.bookings.forEach((booking, index) => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: booking.__past ? this.pinTexturePast : this.pinTextureUpcoming,
        transparent: true,
        opacity: booking.__past ? 0.68 : 0.96,
        depthWrite: false,
        depthTest: true,
      }));
      sprite.position.copy(booking.__vector);
      const scale = booking.__past ? 0.18 : 0.25;
      sprite.scale.set(scale, scale, scale);
      sprite.userData.bookingIndex = index;
      this.pinSprites.push(sprite);
      this.globeGroup.add(sprite);
    });
  }

  buildArcs() {
    if (this.bookings.length < 2) return;
    const now = new Date();
    let activeIndex = this.bookings.findIndex((booking) => new Date(booking.date) >= now && !booking.__past);
    activeIndex = Math.max(0, activeIndex - 1);
    for (let i = 0; i < this.bookings.length - 1; i += 1) {
      const a = this.bookings[i].__vector.clone();
      const b = this.bookings[i + 1].__vector.clone();
      const mid = a.clone().add(b).normalize().multiplyScalar(RADIUS * 1.48);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const isActive = i === activeIndex;
      const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(56));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color: isActive ? 0xffcf5a : 0xb8b0a0,
          transparent: true,
          opacity: isActive ? 0.74 : 0.32,
          blending: THREE.AdditiveBlending,
        })
      );
      this.arcLines.push(line);
      this.globeGroup.add(line);
      if (isActive) this.activeCurve = curve;
    }
  }

  renderItinerary() {
    if (!this.itinerary) return;
    const upcoming = this.bookings.filter((booking) => !booking.__past).length;
    const past = this.bookings.length - upcoming;
    if (this.bookings.length === 0) {
      this.itinerary.innerHTML = `
        <div class="sp-global-panel-title">Itinerary</div>
        <div class="sp-global-empty">No dated bookings yet. Add a booking to route the globe.</div>
      `;
      return;
    }
    this.itinerary.innerHTML = `
      <div class="sp-global-panel-title">Itinerary</div>
      <div class="sp-global-toggle" aria-label="Show states">
        <span><i class="ph ph-map-pin" aria-hidden="true"></i>${upcoming} Upcoming</span>
        <span><i class="ph ph-sparkle" aria-hidden="true"></i>${past} Past</span>
      </div>
      <div class="sp-global-itinerary-list">
        ${this.bookings.map((booking, index) => {
          const title = booking.event || booking.venue || 'Untitled show';
          return `
          <button type="button" class="sp-global-stop ${index === this.selectedIndex ? 'is-active' : ''} ${booking.__past ? 'is-past' : 'is-upcoming'}" data-globe-stop="${index}">
            <span class="sp-global-stop__date">${escapeHtml(shortDate(booking.date))}</span>
            <span class="sp-global-stop__body">
              <strong>${escapeHtml(title)}</strong>
              <em>${escapeHtml(booking.__location.label)}</em>
              <small>${escapeHtml(booking.artist || 'Artist TBC')}</small>
            </span>
          </button>
        `;
        }).join('')}
      </div>
    `;
    this.itinerary.querySelectorAll('[data-globe-stop]').forEach((btn) => {
      btn.addEventListener('click', () => this.selectBooking(Number(btn.dataset.globeStop), { focus: true }));
    });
  }

  renderEmptyDetail() {
    if (!this.detail) return;
    this.detail.innerHTML = `
      <div class="sp-global-detail__kicker"><i class="ph ph-globe-hemisphere-east" aria-hidden="true"></i> Global Schedule</div>
      <h3>No routed shows yet</h3>
      <p class="sp-global-detail__sub">Add bookings with dates and locations to see pins, route arcs, and revenue by territory.</p>
      <button class="sp-global-contract" type="button" onclick="window.showAddBooking?.()"><i class="ph ph-calendar-plus" aria-hidden="true"></i>Add Booking</button>
    `;
  }

  renderDetail(booking) {
    if (!this.detail || !booking) return;
    const revenueLabel = booking.__past ? 'Settled Gross' : 'Projected Revenue';
    const revenueIcon = booking.__past ? 'ph-check-circle' : 'ph-currency-dollar';
    const status = String(booking.status || (booking.__past ? 'completed' : 'pending')).toUpperCase();
    const net = Math.max(0, Math.round((Number(booking.fee) || 0) - (Number(booking.balance) || 0)));
    const title = booking.event || booking.venue || 'Untitled show';
    const locationLine = booking.venue && booking.venue !== title
      ? `${booking.__location.label} - ${booking.venue}`
      : booking.__location.label;
    this.detail.innerHTML = `
      <div class="sp-global-detail__kicker"><i class="ph ${booking.__past ? 'ph-sparkle' : 'ph-map-pin'}" aria-hidden="true"></i>${booking.__past ? 'Past Show' : 'Next Show'}</div>
      <h3>${escapeHtml(title)}</h3>
      <p class="sp-global-detail__sub">${escapeHtml(locationLine)}</p>
      ${booking.__location.approximate ? '<div class="sp-global-approx">Location approximate</div>' : ''}
      <div class="sp-global-detail__meta">
        <span><i class="ph ph-calendar-blank" aria-hidden="true"></i>${escapeHtml(fmtDate(booking.date))}</span>
        <span><i class="ph ph-microphone-stage" aria-hidden="true"></i>${escapeHtml(booking.artist || 'Artist TBC')}</span>
        <span><i class="ph ph-users-three" aria-hidden="true"></i>Capacity: ${escapeHtml(Number(booking.capacity || 0).toLocaleString())}</span>
      </div>
      <div class="sp-global-money">
        <span>${revenueLabel}</span>
        <strong><i class="ph ${revenueIcon}" aria-hidden="true"></i>${escapeHtml(fmtMoney(booking.fee))}</strong>
        <small>Collected ${escapeHtml(fmtMoney(booking.deposit))} · Net ${escapeHtml(fmtMoney(net))}</small>
      </div>
      <button class="sp-global-contract" type="button" data-contract-booking="${escapeHtml(booking.id)}">
        <i class="ph ph-file-text" aria-hidden="true"></i>
        View Full Contract
        <i class="ph ph-caret-right" aria-hidden="true"></i>
      </button>
      <div class="sp-global-detail__rows">
        <span>Status <b>${escapeHtml(status)}</b></span>
        <span>Balance Due <b>${escapeHtml(fmtMoney(booking.balance))}</b></span>
      </div>
    `;
    this.detail.querySelector('[data-contract-booking]')?.addEventListener('click', () => {
      if (typeof window.showSection === 'function') window.showSection('bookings');
      setTimeout(() => {
        if (typeof window.editBooking === 'function') window.editBooking(booking.id);
      }, 60);
    });
  }

  selectBooking(index, options = {}) {
    if (!Number.isFinite(index) || index < 0 || index >= this.bookings.length) return;
    this.selectedIndex = index;
    const booking = this.bookings[index];
    this.renderDetail(booking);
    this.itinerary?.querySelectorAll('[data-globe-stop]').forEach((btn) => {
      btn.classList.toggle('is-active', Number(btn.dataset.globeStop) === index);
    });
    this.pinSprites.forEach((pin, pinIndex) => {
      const active = pinIndex === index;
      const past = this.bookings[pinIndex]?.__past;
      const base = past ? 0.18 : 0.25;
      pin.scale.setScalar(active ? base * 1.28 : base);
      pin.material.opacity = active ? 1 : (past ? 0.66 : 0.92);
    });
    if (options.focus === true) {
      this.focusBooking(index);
    } else if (options.focus === false) {
      this.cancelFocusAnimation();
    }
  }

  cancelFocusAnimation() {
    this.focusAnimation = null;
    this.focusHoldUntil = 0;
  }

  focusBooking(index) {
    const booking = this.bookings[index];
    if (!booking?.__vector || isReducedMotion) return;
    this.globeGroup.updateWorldMatrix(true, true);
    const pin = this.pinSprites[index];
    if (pin) {
      pin.getWorldPosition(this.focusTargetWorld);
    } else {
      this.focusTargetWorld.copy(booking.__vector).applyMatrix4(this.globeGroup.matrixWorld);
    }
    if (this.focusTargetWorld.lengthSq() < 0.001) return;

    const startDirection = this.camera.position.clone().sub(this.controls.target).normalize();
    const targetDirection = this.focusTargetWorld.clone().normalize();
    const rotation = new THREE.Quaternion().setFromUnitVectors(startDirection, targetDirection);
    this.focusAnimation = {
      startedAt: performance.now(),
      duration: 620,
      startDirection,
      targetDirection,
      rotation,
      distance: THREE.MathUtils.clamp(this.camera.position.distanceTo(this.controls.target), this.controls.minDistance, this.controls.maxDistance),
    };
  }

  resetView() {
    this.cancelFocusAnimation();
    this.zoomTo(this.defaultDistance);
  }

  zoomBy(delta) {
    this.cancelFocusAnimation();
    const distance = THREE.MathUtils.clamp(this.camera.position.length() + delta, this.controls.minDistance, this.controls.maxDistance);
    this.zoomTo(distance);
  }

  zoomTo(distance) {
    this.targetDistance = THREE.MathUtils.clamp(distance, this.controls.minDistance, this.controls.maxDistance);
  }

  pick(event) {
    const hitIndex = this.getPinHitIndex(event);
    if (hitIndex >= 0) {
      this.showPinCard(hitIndex, event);
      this.selectBooking(hitIndex, { focus: false });
    } else {
      this.hidePinCard();
    }
  }

  getPinHitIndex(event) {
    if (!this.pinSprites.length) return -1;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let bestIndex = -1;
    let bestDistance = Infinity;
    const hitRadius = rect.width < 520 ? 44 : 32;
    this.pinSprites.forEach((pin, index) => {
      pin.getWorldPosition(this.pickWorld);
      const projected = this.pickWorld.clone().project(this.camera);
      if (projected.z < -1 || projected.z > 1) return;
      const sx = (projected.x * 0.5 + 0.5) * rect.width;
      const sy = (-projected.y * 0.5 + 0.5) * rect.height;
      const distance = Math.hypot(sx - x, sy - y);
      if (distance < hitRadius && distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  previewPin(event) {
    const hitIndex = this.getPinHitIndex(event);
    if (hitIndex >= 0) {
      this.showPinCard(hitIndex, event);
      this.renderer.domElement.style.cursor = 'pointer';
    } else {
      this.hidePinCard();
      this.renderer.domElement.style.cursor = 'grab';
    }
  }

  showPinCard(index, event) {
    const booking = this.bookings[index];
    if (!booking || !this.pinCard) return;
    this.previewIndex = index;
    const rootRect = this.root.getBoundingClientRect();
    const stageRect = this.stage.getBoundingClientRect();
    this.pinCard.innerHTML = `
      <strong>${escapeHtml(booking.event || booking.venue || 'Untitled show')}</strong>
      <span>${escapeHtml(booking.__location.label)} · ${escapeHtml(fmtDate(booking.date))}</span>
      <small>${escapeHtml(booking.artist || 'Artist TBC')} · ${escapeHtml(fmtMoney(booking.fee))}</small>
    `;
    const cardWidth = rootRect.width < 560
      ? Math.min(206, Math.max(170, rootRect.width - 28))
      : Math.min(230, Math.max(190, rootRect.width - 28));
    const rawLeft = (event?.clientX ?? (stageRect.left + stageRect.width / 2)) - rootRect.left + 14;
    const rawTop = (event?.clientY ?? (stageRect.top + stageRect.height / 2)) - rootRect.top - 18;
    const left = THREE.MathUtils.clamp(rawLeft, 12, rootRect.width - cardWidth - 12);
    const top = THREE.MathUtils.clamp(rawTop, 12, Math.max(12, rootRect.height - 116));
    this.pinCard.style.width = `${cardWidth}px`;
    this.pinCard.style.left = `${left}px`;
    this.pinCard.style.top = `${top}px`;
    this.pinCard.hidden = false;
    this.pinCard.setAttribute('aria-hidden', 'false');
  }

  hidePinCard() {
    if (!this.pinCard) return;
    this.previewIndex = null;
    this.pinCard.hidden = true;
    this.pinCard.setAttribute('aria-hidden', 'true');
  }

  toggleAutoTour() {
    if (this.autoTourTimer) {
      clearInterval(this.autoTourTimer);
      this.autoTourTimer = null;
      return;
    }
    if (this.bookings.length === 0) return;
    this.selectBooking(this.selectedIndex || 0, { focus: false });
    this.autoTourTimer = setInterval(() => {
      this.selectBooking((this.selectedIndex + 1) % this.bookings.length, { focus: false });
    }, 3200);
  }

  updateFocusAnimation(now) {
    if (!this.focusAnimation) return;
    const anim = this.focusAnimation;
    const progress = THREE.MathUtils.clamp((now - anim.startedAt) / anim.duration, 0, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const stepRotation = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), anim.rotation, eased);
    const direction = anim.startDirection.clone().applyQuaternion(stepRotation).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(direction, anim.distance);
    this.camera.lookAt(this.controls.target);
    this.controls.update();
    if (progress >= 1) {
      this.focusAnimation = null;
      this.focusHoldUntil = now + 520;
    }
  }

  animate() {
    if (!this.running) return;
    requestAnimationFrame(() => this.animate());
    const delta = Math.min(0.04, this.clock.getDelta());
    const elapsed = this.clock.elapsedTime;
    const now = performance.now();
    if (this.targetDistance) {
      const currentDistance = this.camera.position.length();
      const nextDistance = THREE.MathUtils.lerp(currentDistance, this.targetDistance, Math.min(1, delta * 4.2));
      this.camera.position.setLength(nextDistance);
      if (Math.abs(nextDistance - this.targetDistance) < 0.012) this.targetDistance = null;
    }
    this.updateFocusAnimation(now);
    if (!isReducedMotion && !this.focusAnimation && now > this.focusHoldUntil) {
      this.globeGroup.rotation.y += delta * 0.06;
    }
    this.pinSprites.forEach((pin, index) => {
      if (!this.bookings[index]?.__past && !isReducedMotion) {
        const pulse = 1 + Math.sin(elapsed * 2.5 + index) * 0.07;
        pin.scale.setScalar((index === this.selectedIndex ? 0.32 : 0.25) * pulse);
      }
    });
    if (this.activeCurve && !isReducedMotion) {
      const t = (elapsed * 0.18) % 1;
      this.pulse.position.copy(this.activeCurve.getPoint(t));
      this.pulse.visible = true;
      this.pulse.material.opacity = 0.55 + Math.sin(elapsed * 8) * 0.28;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

function shortDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'TBC';
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' }).toUpperCase();
}

function showFallback(root, error) {
  root.classList.add('sp-global-schedule--fallback');
  const stage = document.getElementById(STAGE_ID);
  if (stage) {
    stage.innerHTML = `
      <div class="sp-global-fallback-card">
        <i class="ph ph-globe-hemisphere-east" aria-hidden="true"></i>
        <strong>Global view fallback</strong>
        <span>${escapeHtml(error?.message || '3D globe unavailable on this device.')}</span>
      </div>
    `;
  }
  try {
    window.renderPerformanceMap?.(window.bookings || [], { showLabels: false, showLocationList: true, showPinnedPanel: true, fallbackOnly: true });
  } catch (_err) {}
}

function init() {
  const root = document.getElementById(ROOT_ID);
  if (!root || window.SP_GLOBAL_GLOBE) return;
  try {
    const globe = new StarPaperGlobe(root);
    window.SP_GLOBAL_GLOBE = {
      isFallback: false,
      render: (bookings, options = {}) => globe.render(bookings, options),
      focusBooking: (id) => {
        const index = globe.bookings.findIndex((booking) => String(booking.id) === String(id));
        if (index >= 0) globe.selectBooking(index, { fly: false });
      },
      recenter: () => globe.resetView(),
    };
    root.classList.add('sp-global-schedule--ready');
  } catch (err) {
    console.warn('[StarPaper Globe] Falling back to static map:', err);
    window.SP_GLOBAL_GLOBE = {
      isFallback: true,
      render: () => {},
      recenter: () => {},
      focusBooking: () => {},
    };
    showFallback(root, err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
