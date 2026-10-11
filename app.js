const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const STORAGE_KEY = 'safar-saathi-v1';
const defaults = {
  places: [],
  trips: [],
  safety: { interval: 24, lastCheck: null, name: '', phone: '' },
  theme: 'mint',
  language: 'en',
  motion: true
};

const CITY_COORDS = {
  Karachi: { lat: 24.8607, lng: 67.0011, zoom: 12 },
  Hyderabad: { lat: 25.3960, lng: 68.3578, zoom: 13 },
  Moro: { lat: 26.6644, lng: 67.9083, zoom: 13 }
};

let data = loadData();
let currentPosition = null;
let activeTripId = null;
let installPrompt = null;
let toastTimer;
let map = null;
let userMarker = null;
let mapReady = false;

function loadData() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}
function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function esc(v = '') {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

function showView(id) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === id));
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (id === 'savedView') renderPlaces();
  if (id === 'tripsView') renderTrips();
  if (id === 'safetyView') renderSafety();
  if (id === 'mapView') {
    setTimeout(() => {
      initMap();
      if (map) map.invalidateSize();
    }, 80);
  }
}

function applyPreferences() {
  document.body.dataset.theme = data.theme || 'mint';
  document.body.classList.toggle('reduce-motion', !data.motion);
  const lang = $('#languageSelect');
  if (lang) lang.value = data.language || 'en';
  const motion = $('#motionToggle');
  if (motion) motion.checked = data.motion !== false;
  $$('.theme-choice').forEach(b => b.classList.toggle('selected', b.dataset.theme === data.theme));
}

function updateNetwork() {
  const online = navigator.onLine;
  const badge = $('#networkBadge');
  if (badge) {
    badge.innerHTML = `<i style="background:${online ? '#31b78a' : '#e4a64b'}"></i> ${online ? 'Online' : 'Offline'}`;
  }
  const netLabel = $('#mapNetworkLabel');
  if (netLabel) netLabel.textContent = online ? 'Online map available' : 'Offline — saved data only';
  const mode = $('#mapMode');
  if (mode) mode.textContent = online ? 'Interactive map' : 'Offline mode';
}

/* ---------- MAP (Leaflet) ---------- */
function initMap() {
  if (mapReady && map) {
    map.invalidateSize();
    return;
  }
  const el = $('#mapCanvas');
  if (!el || typeof L === 'undefined') return;

  const city = $('#citySelect')?.value || 'Karachi';
  const c = CITY_COORDS[city] || CITY_COORDS.Karachi;

  map = L.map('mapCanvas', {
    zoomControl: true,
    attributionControl: true
  }).setView([c.lat, c.lng], c.zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  mapReady = true;

  if (currentPosition) {
    setUserMarker(currentPosition.latitude, currentPosition.longitude);
  }
}

function flyToCity(cityName) {
  const c = CITY_COORDS[cityName];
  if (!c || !map) return;
  map.flyTo([c.lat, c.lng], c.zoom, { duration: 1.1 });
  $('#mapCityLabel').textContent = cityName + ', Pakistan';
}

function setUserMarker(lat, lng) {
  if (!map) return;
  if (userMarker) {
    userMarker.setLatLng([lat, lng]);
  } else {
    userMarker = L.circleMarker([lat, lng], {
      radius: 9,
      color: '#0e766e',
      weight: 3,
      fillColor: '#2dd4bf',
      fillOpacity: 0.9
    }).addTo(map).bindPopup('You are here');
  }
}

function openMap(city) {
  const valid = ['Karachi', 'Hyderabad', 'Moro'].includes(city) ? city : 'Karachi';
  const sel = $('#citySelect');
  if (sel) sel.value = valid;
  $('#mapCityLabel').textContent = valid + ', Pakistan';
  showView('mapView');
  setTimeout(() => {
    initMap();
    flyToCity(valid);
  }, 100);
}

/* ---------- GEOLOCATION ---------- */
function getLocation(callback) {
  if (!navigator.geolocation) {
    toast('Geolocation is not supported on this device.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      currentPosition = {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude
      };
      const summary = $('#locationSummary');
      if (summary) {
        summary.textContent = `${currentPosition.latitude.toFixed(4)}, ${currentPosition.longitude.toFixed(4)}`;
      }
      if (callback) callback(currentPosition);
    },
    err => {
      let msg = 'Could not get location.';
      if (err.code === 1) msg = 'Location permission denied.';
      if (err.code === 2) msg = 'Location unavailable.';
      if (err.code === 3) msg = 'Location request timed out.';
      toast(msg);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
  );
}

/* ---------- PLACES ---------- */
function renderPlaces() {
  const list = $('#savedPlacesList');
  const empty = $('#savedEmpty');
  if (!list || !empty) return;
  if (!data.places.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = data.places.map(p => `
    <div class="place-item glass">
      <div class="item-icon">⌖</div>
      <div class="item-body">
        <b>${esc(p.name)}</b>
        <small>${esc(p.city)} · ${esc(p.category)} · ${esc(p.address).slice(0, 48)}${p.address.length > 48 ? '…' : ''}</small>
      </div>
      <div class="item-actions">
        <button class="secondary-button compact" data-place-open="${p.id}" title="Open on map">↗</button>
        <button class="secondary-button compact" data-place-edit="${p.id}" title="Edit">✎</button>
        <button class="danger-button compact" data-place-delete="${p.id}" title="Delete">✕</button>
      </div>
    </div>
  `).join('');
}

function openPlaceDialog(place = null) {
  const dlg = $('#placeDialog');
  const form = $('#placeForm');
  if (!dlg || !form) return;
  form.reset();
  $('#placeDialogTitle').textContent = place ? 'Edit place' : 'Add a place';
  if (place) {
    $('#placeId').value = place.id;
    $('#placeName').value = place.name;
    $('#placeAddress').value = place.address;
    $('#placeCity').value = place.city || 'Karachi';
    $('#placeCategory').value = place.category || 'Favourite';
  } else {
    $('#placeId').value = '';
  }
  dlg.showModal();
}

function savePlace(e) {
  e.preventDefault();
  const id = $('#placeId').value || uid();
  const place = {
    id,
    name: $('#placeName').value.trim(),
    address: $('#placeAddress').value.trim(),
    city: $('#placeCity').value,
    category: $('#placeCategory').value,
    updatedAt: new Date().toISOString()
  };
  if (!place.name || !place.address) return;
  const idx = data.places.findIndex(p => p.id === id);
  if (idx >= 0) data.places[idx] = place;
  else data.places.unshift(place);
  saveData();
  $('#placeDialog').close();
  renderPlaces();
  toast(idx >= 0 ? 'Place updated.' : 'Place saved.');
}

/* ---------- TRIPS ---------- */
function renderTrips() {
  const list = $('#tripList');
  const empty = $('#tripsEmpty');
  const activeCard = $('#activeTripCard');
  if (!list || !empty) return;

  const active = data.trips.find(t => t.status === 'active');
  activeTripId = active ? active.id : null;

  if (active && activeCard) {
    activeCard.hidden = false;
    activeCard.innerHTML = `
      <span class="eyebrow"><span class="pulse"></span> TRIP IN PROGRESS</span>
      <h3>${esc(active.name)}</h3>
      <p>Destination: ${esc(active.destination)} · Started ${new Date(active.startedAt).toLocaleString()}</p>
      <div class="item-actions">
        <button class="primary-button compact" id="shareActiveTrip">Share trip details</button>
        <button class="secondary-button compact" id="endActiveTrip">End trip</button>
      </div>
    `;
    $('#shareActiveTrip').onclick = () => shareText(tripShareText(active));
    $('#endActiveTrip').onclick = () => endTrip(active.id);
  } else if (activeCard) {
    activeCard.hidden = true;
  }

  const past = data.trips.filter(t => t.status !== 'active');
  if (!past.length && !active) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = past.map(t => `
    <div class="trip-item glass">
      <div class="item-icon">↗</div>
      <div class="item-body">
        <b>${esc(t.name)}</b>
        <small>${esc(t.destination)} · ${esc(t.city)} · ${t.status}</small>
      </div>
      <div class="item-actions">
        <button class="secondary-button compact" data-trip-share="${t.id}">↗</button>
        <button class="danger-button compact" data-trip-delete="${t.id}">✕</button>
      </div>
    </div>
  `).join('');
}

function newTripDialog() {
  const form = $('#tripForm');
  if (form) form.reset();
  $('#tripDialog')?.showModal();
}

function startTrip() {
  const active = data.trips.find(t => t.status === 'active');
  if (active) {
    showView('tripsView');
    toast('A trip is already in progress.');
    return;
  }
  newTripDialog();
}

function saveTrip(e) {
  e.preventDefault();
  const trip = {
    id: uid(),
    name: $('#tripName').value.trim(),
    destination: $('#tripDestination').value.trim(),
    city: $('#tripCity').value,
    notes: $('#tripNotes').value.trim(),
    status: 'active',
    startedAt: new Date().toISOString()
  };
  if (!trip.name || !trip.destination) return;
  data.trips.unshift(trip);
  saveData();
  $('#tripDialog').close();
  showView('tripsView');
  renderTrips();
  toast('Trip started.');
}

function tripShareText(t) {
  return `Safar Saathi trip: ${t.name}\nDestination: ${t.destination}, ${t.city}\nStatus: ${t.status === 'active' ? 'In progress' : 'Saved trip'}\n${t.notes || ''}`;
}

async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Safar Saathi', text });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('Details copied. Paste them into a message.');
  } catch {
    window.prompt('Copy these details:', text);
  }
}

function endTrip(id) {
  const t = data.trips.find(x => x.id === id);
  if (!t) return;
  t.status = 'completed';
  t.endedAt = new Date().toISOString();
  activeTripId = null;
  saveData();
  renderTrips();
  toast('Trip marked as completed.');
}

/* ---------- SAFETY ---------- */
function renderSafety() {
  const s = data.safety || defaults.safety;
  const interval = $('#checkInterval');
  if (interval) interval.value = String(s.interval || 24);
  const name = $('#trustedName');
  if (name) name.value = s.name || '';
  const phone = $('#trustedPhone');
  if (phone) phone.value = s.phone || '';

  if (s.lastCheck) {
    const elapsed = (Date.now() - new Date(s.lastCheck).getTime()) / 3600000;
    const overdue = elapsed > (Number(s.interval) || 24);
    $('#safetyStatus').textContent = overdue ? 'Check-in overdue' : 'You checked in successfully';
    $('#safetyDescription').textContent =
      `Last check-in: ${new Date(s.lastCheck).toLocaleString()}${overdue ? ' — please check in and contact someone if needed.' : '.'}`;
  } else {
    $('#safetyStatus').textContent = "Let them know you're okay";
    $('#safetyDescription').textContent = 'Tap below to record a check-in on this device.';
  }
}

function checkIn() {
  data.safety.lastCheck = new Date().toISOString();
  saveData();
  renderSafety();
  toast("Check-in recorded. You're marked safe.");
}

function contactTrusted() {
  const phone = (data.safety.phone || '').replace(/\s/g, '');
  if (phone) {
    window.location.href = `tel:${phone}`;
  } else {
    toast('Add a trusted contact phone in safety settings first.');
  }
}

/* ---------- COMPASS ---------- */
let compassActive = false;
function enableCompass() {
  if (compassActive) return;
  const handler = (e) => {
    let heading = e.webkitCompassHeading ?? e.alpha;
    if (heading == null) return;
    if (e.webkitCompassHeading == null && e.absolute !== true) return;
    if (e.webkitCompassHeading == null) heading = 360 - heading;
    const needle = $('.compass-needle');
    if (needle) needle.style.transform = `rotate(${heading}deg)`;
    const val = $('#headingValue');
    if (val) val.textContent = Math.round(heading) + '°';
    const hint = $('#compassHint');
    if (hint) hint.textContent = 'Live heading from device sensors';
  };

  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(state => {
        if (state === 'granted') {
          window.addEventListener('deviceorientation', handler, true);
          compassActive = true;
          toast('Compass enabled.');
        } else {
          toast('Motion permission denied.');
        }
      })
      .catch(() => toast('Could not enable compass.'));
  } else {
    window.addEventListener('deviceorientation', handler, true);
    compassActive = true;
    toast('Compass listening for device motion.');
  }
}

/* ---------- DATA EXPORT / IMPORT ---------- */
function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `safar-saathi-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Backup downloaded.');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      data = { ...defaults, ...parsed };
      saveData();
      applyPreferences();
      renderPlaces();
      renderTrips();
      renderSafety();
      toast('Backup restored.');
    } catch {
      toast('Invalid backup file.');
    }
  };
  reader.readAsText(file);
}

function clearData() {
  if (!confirm('Clear all saved places, trips and safety settings on this device?')) return;
  data = { ...defaults };
  saveData();
  applyPreferences();
  renderPlaces();
  renderTrips();
  renderSafety();
  toast('Local data cleared.');
}

/* ---------- INIT ---------- */
function init() {
  applyPreferences();
  updateNetwork();
  renderPlaces();
  renderTrips();
  renderSafety();

  // Navigation
  $$('.nav-item').forEach(b => b.onclick = () => showView(b.dataset.view));
  $('#brandHome')?.addEventListener('click', e => {
    e.preventDefault();
    showView('homeView');
  });
  $('#settingsBtn')?.addEventListener('click', () => showView('settingsView'));
  $$('[data-open]').forEach(b => b.onclick = () => showView(b.dataset.open));

  // City cards
  $$('.city-card').forEach(b => {
    b.onclick = () => openMap(b.dataset.city);
  });

  // Map controls
  $('#citySelect')?.addEventListener('change', e => {
    flyToCity(e.target.value);
  });
  $('#mapMyLocation')?.addEventListener('click', () => {
    getLocation(pos => {
      if (map) {
        map.flyTo([pos.latitude, pos.longitude], 15, { duration: 1 });
        setUserMarker(pos.latitude, pos.longitude);
      }
      toast('Location found.');
    });
  });
  $('#placeSearch')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = e.target.value.trim();
      if (!q) return;
      window.open(
        'https://www.openstreetmap.org/search?query=' + encodeURIComponent(q),
        '_blank',
        'noopener'
      );
    }
  });
  $('#routeWalkBtn')?.addEventListener('click', () => {
    if (!currentPosition) {
      toast('Find your location first.');
      return;
    }
    const city = $('#citySelect')?.value || 'Karachi';
    const c = CITY_COORDS[city];
    window.open(
      `https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${currentPosition.latitude}%2C${currentPosition.longitude}%3B${c.lat}%2C${c.lng}`,
      '_blank',
      'noopener'
    );
  });
  $('#routeDriveBtn')?.addEventListener('click', () => {
    if (!currentPosition) {
      toast('Find your location first.');
      return;
    }
    const city = $('#citySelect')?.value || 'Karachi';
    const c = CITY_COORDS[city];
    window.open(
      `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${currentPosition.latitude}%2C${currentPosition.longitude}%3B${c.lat}%2C${c.lng}`,
      '_blank',
      'noopener'
    );
  });
  $('#shareLocBtn')?.addEventListener('click', () => {
    if (!currentPosition) {
      toast('Find your location first.');
      return;
    }
    const text = `My location (Safar Saathi):\nhttps://www.openstreetmap.org/?mlat=${currentPosition.latitude}&mlon=${currentPosition.longitude}#map=16/${currentPosition.latitude}/${currentPosition.longitude}`;
    shareText(text);
  });

  // Home actions
  $('#findMeBtn')?.addEventListener('click', () => {
    getLocation(() => {
      toast('Location updated.');
      openMap('Karachi');
      setTimeout(() => {
        if (map && currentPosition) {
          map.flyTo([currentPosition.latitude, currentPosition.longitude], 15);
          setUserMarker(currentPosition.latitude, currentPosition.longitude);
        }
      }, 200);
    });
  });
  $('#startTripBtn')?.addEventListener('click', startTrip);

  // Places
  $('#addPlaceBtn')?.addEventListener('click', () => openPlaceDialog());
  $('#emptyAddPlace')?.addEventListener('click', () => openPlaceDialog());
  $('#placeForm')?.addEventListener('submit', savePlace);

  // Trips
  $('#newTripBtn')?.addEventListener('click', startTrip);
  $('#emptyNewTrip')?.addEventListener('click', startTrip);
  $('#tripForm')?.addEventListener('submit', saveTrip);

  // Safety
  $('#imSafeBtn')?.addEventListener('click', checkIn);
  $('#saveSafetyBtn')?.addEventListener('click', () => {
    data.safety.interval = Number($('#checkInterval').value);
    data.safety.name = $('#trustedName').value.trim();
    data.safety.phone = $('#trustedPhone').value.trim();
    saveData();
    renderSafety();
    toast('Safety preferences saved locally.');
  });
  $('#contactTrustedBtn')?.addEventListener('click', contactTrusted);

  // Compass
  $('#enableCompassBtn')?.addEventListener('click', enableCompass);

  // Settings
  $$('.theme-choice').forEach(b => {
    b.onclick = () => {
      data.theme = b.dataset.theme;
      saveData();
      applyPreferences();
    };
  });
  $('#languageSelect')?.addEventListener('change', e => {
    data.language = e.target.value;
    saveData();
    toast(e.target.value === 'ur'
      ? 'Urdu preference saved. Full UI translation can be added later.'
      : 'Language preference saved.');
  });
  $('#motionToggle')?.addEventListener('change', e => {
    data.motion = e.target.checked;
    saveData();
    applyPreferences();
  });
  $('#permissionHelpBtn')?.addEventListener('click', () => {
    toast('In Chrome: tap the lock/site icon → Permissions → Location → Allow. Use HTTPS.');
  });
  $('#exportBtn')?.addEventListener('click', exportData);
  $('#importFile')?.addEventListener('change', e => {
    if (e.target.files[0]) importData(e.target.files[0]);
    e.target.value = '';
  });
  $('#clearDataBtn')?.addEventListener('click', clearData);

  // Dialog close buttons
  $$('[data-close]').forEach(b => {
    b.onclick = () => {
      const id = b.dataset.close;
      const dlg = document.getElementById(id);
      if (dlg) dlg.close();
    };
  });

  // List actions (delegation)
  $('#savedPlacesList')?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.placeOpen || b.dataset.placeEdit || b.dataset.placeDelete;
    const p = data.places.find(x => x.id === id);
    if (!p) return;
    if (b.dataset.placeOpen) {
      openMap(p.city === 'Hyderabad' ? 'Hyderabad' : p.city === 'Moro' ? 'Moro' : 'Karachi');
      window.open(
        'https://www.openstreetmap.org/search?query=' + encodeURIComponent(p.address),
        '_blank',
        'noopener'
      );
    }
    if (b.dataset.placeEdit) openPlaceDialog(p);
    if (b.dataset.placeDelete && confirm(`Delete "${p.name}"?`)) {
      data.places = data.places.filter(x => x.id !== p.id);
      saveData();
      renderPlaces();
      toast('Place deleted.');
    }
  });

  $('#tripList')?.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.tripShare || b.dataset.tripDelete;
    const t = data.trips.find(x => x.id === id);
    if (!t) return;
    if (b.dataset.tripShare) shareText(tripShareText(t));
    if (b.dataset.tripDelete && confirm(`Delete trip "${t.name}"?`)) {
      data.trips = data.trips.filter(x => x.id !== t.id);
      saveData();
      renderTrips();
      toast('Trip deleted.');
    }
  });

  // Network + install
  window.addEventListener('online', updateNetwork);
  window.addEventListener('offline', updateNetwork);
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installPrompt = e;
    const btn = $('#installBtn');
    if (btn) btn.hidden = false;
  });
  $('#installBtn')?.addEventListener('click', async () => {
    if (!installPrompt) {
      toast('Use browser menu → Install app / Add to Home screen.');
      return;
    }
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    const btn = $('#installBtn');
    if (btn) btn.hidden = true;
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  if (!navigator.onLine) toast('Offline mode: local features are available.');
}

init();
