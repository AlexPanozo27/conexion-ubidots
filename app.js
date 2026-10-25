(function () {
'use strict';
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};
const pad = n => String(n).padStart(2, '0');
const clock = () => { const d = new Date(); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
const LABEL_RE = /^[a-z0-9_-]+$/;
const TOKEN_OK = 'BBUS-EJEMPLO-NO-REAL';
const HOST = 'industrial.api.ubidots.com';

/* ---------- aparición y menú ---------- */
const rises = $$('.rise');
if ('IntersectionObserver' in window) {
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .06 });
  rises.forEach(r => io.observe(r));
} else rises.forEach(r => r.classList.add('in'));
const links = $$('.topbar nav a');
const secs = links.map(a => $(a.getAttribute('href'))).filter(Boolean);
function markNav() {
  let cur = null;
  secs.forEach(s => { if (s.getBoundingClientRect().top < innerHeight * .4) cur = s.id; });
  links.forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + cur));
}
addEventListener('scroll', markNav, { passive: true }); markNav();

/* ---------- hero: rutas y buscador ---------- */
const fProto = $('#fProto');
function setTrip(p) {
  const t = p === 'udp' ? 'tcp' : p;
  $$('.trip').forEach(b => { const on = b.dataset.proto === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
}
$$('.trip').forEach(b => b.addEventListener('click', () => { fProto.value = b.dataset.proto; setTrip(b.dataset.proto); }));
fProto.addEventListener('change', () => setTrip(fProto.value));
$('#finder').addEventListener('submit', e => {
  e.preventDefault();
  const v = parseFloat(String($('#fVal').value).replace(',', '.'));
  S.dev = $('#fDev').value.trim(); S.vr = $('#fVar').value.trim();
  if (isNaN(v)) S.valMode = 'text'; else { S.valMode = 'num'; S.temp = Math.max(-10, Math.min(60, v)); }
  S.proto = fProto.value;
  writeForm();
  $('#simulador').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(() => send(), 800);
});

/* ---------- maleta ---------- */
const bagItems = $$('#bag li');
const savedBag = (store.get('ub-bag') || '').split(',');
function bagUpdate() {
  const n = bagItems.filter(li => li.classList.contains('on')).length;
  $('#bagBar').style.width = (n / bagItems.length * 100) + '%';
  $('#bagTxt').textContent = n === bagItems.length ? '¡Maleta lista! Ya puedes elegir tu ruta.' : 'Maleta lista: ' + n + ' de ' + bagItems.length;
  store.set('ub-bag', bagItems.map((li, i) => li.classList.contains('on') ? i : '').filter(x => x !== '').join(','));
}
bagItems.forEach((li, i) => {
  if (savedBag.includes(String(i))) { li.classList.add('on'); li.setAttribute('aria-checked', 'true'); }
  const tog = () => { li.classList.toggle('on'); li.setAttribute('aria-checked', li.classList.contains('on')); bagUpdate(); };
  li.addEventListener('click', tog);
  li.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } });
});
bagUpdate();

/* ---------- ¿qué ruta me conviene? ---------- */
const rq = {};
$$('#quizRoute .chips').forEach(g => g.addEventListener('click', e => {
  const b = e.target.closest('.chip'); if (!b) return;
  $$('.chip', g).forEach(c => c.setAttribute('aria-pressed', c === b));
  rq[g.dataset.q] = b.dataset.v;
  if (rq.orders && rq.freq && rq.small) {
    let p, why;
    if (rq.orders === 'si') { p = 'MQTT'; why = 'Necesitas recibir órdenes. Con MQTT te suscribes al tópico de la variable y Ubidots te empuja el valor en cuanto cambia.'; }
    else if (rq.small === 'si') { p = 'TCP o UDP'; why = 'Con poca memoria o un módem, un mensaje de texto con barras verticales es lo más liviano. Elige TCP si quieres confirmación; UDP si puedes perder algún dato.'; }
    else if (rq.freq === 'often') { p = 'MQTT'; why = 'Enviar cada pocos segundos con HTTP abre y cierra una conexión cada vez. MQTT deja una abierta y gasta menos.'; }
    else { p = 'HTTP'; why = 'Envías de vez en cuando y no necesitas órdenes: una petición con JSON y un código de respuesta es lo más simple de programar y de probar.'; }
    $('#routeRes').className = 'note good';
    $('#routeRes').innerHTML = '<b>Tu ruta: ' + p + '.</b> ' + why;
  }
}));

/* ---------- itinerario ---------- */
const DAYS = [
  { t: 'Cuenta', s: 'Parada 1', stops: [
    ['Crea tu cuenta', 'Regístrate en Ubidots. Para estudiantes existe el nivel STEM, gratuito y pensado para aprender.', '5 min'],
    ['Entra a tu panel', 'Verás los menús de Devices, Dashboards y datos. Ahí aparecerá todo lo que envíes.', '1 min'],
    ['Confirma tu servidor', 'Las guías oficiales usan ' + HOST + '. Revisa en la documentación de tu cuenta a qué servidor apuntar.', '2 min']],
    note: ['bad', '<b>Falla típica:</b> trabajar con el token de una cuenta y mirar el panel de otra. Los datos llegan, pero no los ves.'] },
  { t: 'Token', s: 'Parada 2', stops: [
    ['Abre API Credentials', 'Está en el menú de tu usuario, arriba a la derecha.', '1 min'],
    ['Copia el token', 'Es una cadena larga que dice quién eres y a qué cuenta pertenece cada dato.', '1 min'],
    ['Guárdalo fuera del código', 'En un archivo aparte que no subas a GitHub. Si se filtra, genera uno nuevo.', '3 min']],
    note: ['bad', '<b>Falla típica:</b> pegar el token dentro del código y subirlo a un repositorio público.'] },
  { t: 'Ruta', s: 'Parada 3', stops: [
    ['Elige el protocolo', 'HTTP para enviar de vez en cuando, MQTT para ida y vuelta, TCP/UDP para mensajes mínimos.', '2 min'],
    ['Anota host y puerto', 'Mismo host siempre. Puertos: 80, 1883 o 9012 sin cifrar.', '1 min'],
    ['Decide si cifras', 'Con TLS cambian los puertos: 443, 8883 o 9812. Cifrar protege el token en el trayecto.', '2 min']],
    note: ['', '<b>Pista:</b> si dudas, empieza por HTTP con curl. Si funciona ahí, el resto es repetir con otro formato.'] },
  { t: 'Mensaje', s: 'Parada 4', stops: [
    ['Nombra el dispositivo', 'Su label va en minúsculas, sin espacios (esp32-aula). Si no existe, Ubidots lo crea con el primer dato.', '1 min'],
    ['Nombra la variable', 'Una por magnitud: temperatura, humedad, ventilador. Mismas reglas que el label.', '1 min'],
    ['Arma el dot', 'Un dato lleva value (número), timestamp en milisegundos (opcional) y context (opcional, pares clave-valor).', '3 min']],
    note: ['bad', '<b>Falla típica:</b> mandar texto en <code>value</code>. El texto va en <code>context</code>.'] },
  { t: 'Envío', s: 'Parada 5', stops: [
    ['Prueba desde la terminal', 'Usa el generador de código: curl, mosquitto o netcat. Un solo dato basta.', '5 min'],
    ['Lee la respuesta', 'En HTTP, un código 2xx es éxito; 401 o 403 apuntan al token; 4xx al formato. En MQTT mira el resultado de la conexión.', '2 min'],
    ['Pasa el código a la placa', 'Con el mismo formato, ahora desde el ESP32: conecta el Wi-Fi, arma el JSON y envía en un ciclo.', '15 min']],
    note: ['bad', '<b>Falla típica:</b> el sensor mide bien pero la placa nunca conectó al Wi-Fi. Imprime el estado por Serial.'] },
  { t: 'Verifica', s: 'Parada 6', stops: [
    ['Mira Devices', 'Tu dispositivo aparece solo, con las variables que enviaste.', '1 min'],
    ['Abre la variable', 'Revisa los dots: valor, hora y contexto. Comprueba que la hora sea la de hoy.', '2 min'],
    ['Crea un widget', 'Una gráfica para ver y un interruptor para controlar. El interruptor escribe una variable que tu dispositivo puede leer.', '10 min']],
    note: ['good', '<b>Meta cumplida:</b> el dato viajó del sensor a la nube y volvió una orden. Eso es una conexión completa.'] }
];
const daysEl = $('#days');
DAYS.forEach((d, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'day' + (i ? '' : ' on'); b.setAttribute('role', 'tab');
  b.innerHTML = '<small>' + d.s + '</small>' + d.t;
  b.addEventListener('click', () => showDay(i));
  daysEl.appendChild(b);
});
function showDay(i) {
  $$('.day', daysEl).forEach((b, j) => { b.classList.toggle('on', i === j); b.setAttribute('aria-selected', i === j); });
  const d = DAYS[i];
  $('#stops').innerHTML = d.stops.map((s, k) => '<li><span class="dot">' + (k + 1) + '</span><b>' + s[0] + '<span class="time">' + s[2] + '</span></b><span>' + s[1] + '</span></li>').join('');
  $('#dayNote').innerHTML = '<div class="note ' + d.note[0] + '" style="margin-top:16px">' + d.note[1] + '</div>';
}
showDay(0);

/* ---------- generador de código ---------- */
let gKind = 'curl';
function gVals() {
  const dev = $('#gDev').value.trim(), vr = $('#gVar').value.trim(), tok = $('#gTok').value.trim() || 'TU_TOKEN';
  const raw = $('#gVal').value.trim().replace(',', '.');
  const num = raw !== '' && !isNaN(Number(raw));
  return { dev, vr, tok, raw, num, val: num ? String(Number(raw)) : JSON.stringify(raw) };
}
function gBuild() {
  const g = gVals(), json = '{"' + g.vr + '": ' + g.val + '}';
  const q = json.replace(/"/g, '\\"');
  switch (gKind) {
    case 'curl': return '# Envía un dato por HTTP (REST)\ncurl -X POST "https://' + HOST + '/api/v1.6/devices/' + g.dev + '/" \\\n  -H "X-Auth-Token: ' + g.tok + '" \\\n  -H "Content-Type: application/json" \\\n  -d \'' + json + '\'\n\n# Leer el último valor de una variable\ncurl "https://' + HOST + '/api/v1.6/devices/' + g.dev + '/' + g.vr + '/lv" \\\n  -H "X-Auth-Token: ' + g.tok + '"';
    case 'mosq': return '# Publicar (usuario = token, contraseña vacía)\nmosquitto_pub -h ' + HOST + ' -p 1883 \\\n  -u "' + g.tok + '" -P "" \\\n  -t "/v1.6/devices/' + g.dev + '" \\\n  -m \'' + json + '\'\n\n# Recibir el último valor (el tópico va en minúsculas)\nmosquitto_sub -h ' + HOST + ' -p 1883 \\\n  -u "' + g.tok + '" -P "" \\\n  -t "/v1.6/devices/' + g.dev + '/' + g.vr + '/lv"';
    case 'nc': return '# TCP (puerto 9012; con TLS, 9812)\necho "mi-app/1.0|POST|' + g.tok + '|' + g.dev + '=>' + g.vr + ':' + (g.num ? g.val : 'VALOR') + '|end" | nc ' + HOST + ' 9012\n\n# UDP: igual, pero con -u\necho "mi-app/1.0|POST|' + g.tok + '|' + g.dev + '=>' + g.vr + ':' + (g.num ? g.val : 'VALOR') + '|end" | nc -u ' + HOST + ' 9012\n\n# Último valor de la variable\necho "mi-app/1.0|LV|' + g.tok + '|' + g.dev + ':' + g.vr + '|end" | nc ' + HOST + ' 9012';
    case 'eh': return '#include <WiFi.h>\n#include <HTTPClient.h>\n\nconst char* WIFI_SSID = "TU_RED";\nconst char* WIFI_PASS = "TU_CLAVE";\nconst char* TOKEN     = "' + g.tok + '";\nconst char* DEVICE    = "' + g.dev + '";\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(WIFI_SSID, WIFI_PASS);\n  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }\n  Serial.println("\\nWi-Fi listo");\n}\n\nvoid loop() {\n  float valor = ' + (g.num ? g.val : '24.5') + ';   // aquí leerías tu sensor\n  String payload = "{\\"' + g.vr + '\\": " + String(valor) + "}";\n\n  HTTPClient http;\n  http.begin(String("http://' + HOST + '/api/v1.6/devices/") + DEVICE + "/");\n  http.addHeader("X-Auth-Token", TOKEN);\n  http.addHeader("Content-Type", "application/json");\n  int code = http.POST(payload);\n  Serial.println(code);   // 2xx = guardado; negativo = no hubo conexión\n  http.end();\n  delay(10000);\n}';
    case 'em': return '#include <WiFi.h>\n#include <PubSubClient.h>\n\nconst char* WIFI_SSID = "TU_RED";\nconst char* WIFI_PASS = "TU_CLAVE";\nconst char* TOKEN     = "' + g.tok + '";\nconst char* TOPIC_PUB = "/v1.6/devices/' + g.dev + '";\nconst char* TOPIC_SUB = "/v1.6/devices/' + g.dev + '/ventilador/lv";  // minúsculas\n\nWiFiClient wifi;\nPubSubClient mqtt(wifi);\nunsigned long ultimo = 0;\n\nvoid alLlegar(char* topic, byte* data, unsigned int len) {\n  String v;\n  for (unsigned int i = 0; i < len; i++) v += (char)data[i];\n  Serial.println(String(topic) + " -> " + v);   // "1" = encender\n}\n\nvoid conectar() {\n  while (!mqtt.connected()) {\n    // usuario = token, contraseña vacía\n    if (mqtt.connect("' + g.dev + '-01", TOKEN, "")) mqtt.subscribe(TOPIC_SUB);\n    else delay(2000);\n  }\n}\n\nvoid setup() {\n  Serial.begin(115200);\n  WiFi.begin(WIFI_SSID, WIFI_PASS);\n  while (WiFi.status() != WL_CONNECTED) delay(500);\n  mqtt.setServer("' + HOST + '", 1883);\n  mqtt.setCallback(alLlegar);\n}\n\nvoid loop() {\n  if (!mqtt.connected()) conectar();\n  mqtt.loop();\n  if (millis() - ultimo > 10000) {\n    ultimo = millis();\n    float valor = ' + (g.num ? g.val : '24.5') + ';   // tu sensor\n    String payload = "{\\"' + g.vr + '\\": " + String(valor) + "}";\n    mqtt.publish(TOPIC_PUB, payload.c_str());\n  }\n}';
  }
}
function gRender() {
  $('#gCode').textContent = gBuild();
  const g = gVals(), w = [];
  if (!LABEL_RE.test(g.dev)) w.push('El label del dispositivo debe ir en minúsculas y sin espacios (letras, números, guion y guion bajo).');
  if (!LABEL_RE.test(g.vr)) w.push('El label de la variable también debe ir en minúsculas y sin espacios.');
  if (!g.num) w.push('El value debe ser un número. Si quieres mandar texto, va en el context.');
  const el = $('#gWarn'); el.hidden = !w.length; el.innerHTML = w.join('<br>');
}
['#gDev', '#gVar', '#gVal', '#gTok'].forEach(s => $(s).addEventListener('input', gRender));
$('#gTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  gKind = b.dataset.k; $$('#gTabs button').forEach(x => x.classList.toggle('on', x === b)); gRender();
});
$('#gCopy').addEventListener('click', () => {
  const t = $('#gCode').textContent, done = () => { $('#gCopy').textContent = '¡Copiado!'; setTimeout(() => $('#gCopy').textContent = 'Copiar', 1500); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => {});
  else { const a = document.createElement('textarea'); a.value = t; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); done(); } catch (e) {} a.remove(); }
});
gRender();

/* =========================================================
   SIMULADOR
   ========================================================= */
const PORTS = { http: [80, 443], mqtt: [1883, 8883], tcp: [9012, 9812], udp: [9012, 9812] };
const S = { proto: 'http', tls: false, portMismatch: false, wifi: true, auto: false, sub: true,
  dev: 'esp32-aula', vr: 'temperatura', temp: 24, tok: 'ok', valMode: 'num', ts: 'none',
  cloud: {}, devFan: 0, conns: [], timer: null, done: {} };
const CH = [
  ['ok', 'Envía un dato correcto y mira nacer el dispositivo en Ubidots.'],
  ['token', 'Provoca un token incorrecto y lee el error que devuelve cada ruta.'],
  ['wifi', 'Apaga el Wi-Fi del dispositivo y envía.'],
  ['mqtt', 'Cambia a MQTT y envía un dato.'],
  ['down', 'Con MQTT, enciende el ventilador en el Dashboard y míralo llegar al dispositivo.'],
  ['lv', 'Con HTTP, enciende el ventilador en el Dashboard y pulsa «Pedir último valor» en el dispositivo.'],
  ['rate', 'Lanza una ráfaga de 10 por TCP o UDP y mira el límite de 5 por segundo.']
];
const CASES = {
  token: ['El token no pertenece a ninguna cuenta: copiaste otro, le falta un carácter o tiene un espacio al final.', 'Vuelve a copiarlo desde API Credentials y revisa que no sobre nada.'],
  wifi: ['El router está apagado, la clave está mal escrita o la señal es débil. El paquete ni siquiera sale de la placa.', 'Reintenta la conexión con WiFi.reconnect() y guarda los datos para enviarlos cuando vuelva la red.'],
  text: ['El campo value solo acepta números. El texto va en context.', 'Manda el número en value y el texto aparte: {"value": 1, "context": {"estado": "caliente"}}.'],
  ts: ['Ubidots espera el timestamp en milisegundos Unix (13 dígitos) y mandaste segundos (10 dígitos). El dato queda guardado en enero de 1970.', 'Multiplica por 1000, o no mandes timestamp y deja que Ubidots ponga la hora.'],
  label: ['El label es el identificador del dispositivo, no su nombre bonito. Con mayúsculas o espacios la URL, el tópico o el mensaje salen mal.', 'Usa minúsculas, sin espacios y con guiones: esp32-aula. El nombre para humanos se cambia en el panel.'],
  tls: ['Activaste el cifrado pero sigues apuntando al puerto sin TLS. El servidor espera texto claro y recibe un saludo cifrado.', 'Con TLS usa otro puerto: 443 (HTTP), 8883 (MQTT) o 9812 (TCP/UDP).']
};
const el = {
  log: $('#log'), pkt: $('#pkt'), netLbl: $('#netLbl'), fanSvg: $('#fanSvg'), fanTxt: $('#fanTxt')
};

function port() { return PORTS[S.proto][S.tls && !S.portMismatch ? 1 : 0]; }
function tokenStr() { return S.tok === 'ok' ? TOKEN_OK : S.tok === 'bad' ? 'BBUS-TOKEN-AJENO' : ''; }
function labelsOk() { return LABEL_RE.test(S.dev) && LABEL_RE.test(S.vr); }
function valueJson() { return S.valMode === 'num' ? S.temp.toFixed(1) : '"caliente"'; }
function tsNow() { return S.ts === 'ms' ? Date.now() : S.ts === 's' ? Math.floor(Date.now() / 1000) : null; }

function log(kind, html) {
  const d = document.createElement('div'); d.className = 'l';
  d.innerHTML = '<span class="t">' + clock() + '</span> <span class="' + kind + '">' + html + '</span>';
  el.log.appendChild(d);
  while (el.log.children.length > 120) el.log.removeChild(el.log.firstChild);
  el.log.scrollTop = el.log.scrollHeight;
}
function mark(id) {
  if (S.done[id]) return;
  S.done[id] = true; renderChallenges();
  const c = CH.find(x => x[0] === id); log('ok', '✔ Reto cumplido: ' + esc(c[1]));
}
function renderChallenges() {
  $('#challenge').innerHTML = CH.map((c, i) => '<li class="' + (S.done[c[0]] ? 'done' : '') + '"><span class="b">' + (S.done[c[0]] ? '✓' : i + 1) + '</span><span>' + esc(c[1]) + '</span></li>').join('');
  const n = CH.filter(c => S.done[c[0]]).length;
  $('#chPill').textContent = n + ' de ' + CH.length; $('#chPill').className = 'pill' + (n === CH.length ? ' ok' : '');
  $('#chBar').style.width = (n / CH.length * 100) + '%';
}

function readForm() {
  S.dev = $('#sDev').value.trim(); S.vr = $('#sVar').value.trim();
  S.temp = parseFloat($('#sTemp').value); S.tok = $('#sTok').value; S.valMode = $('#sValMode').value; S.ts = $('#sTs').value;
}
function writeForm() {
  $('#sDev').value = S.dev; $('#sVar').value = S.vr;
  $('#sTemp').value = S.temp; $('#sTempTxt').textContent = S.temp.toFixed(1) + ' °C';
  $('#sTok').value = S.tok; $('#sValMode').value = S.valMode; $('#sTs').value = S.ts;
  $('#sWifi').checked = S.wifi; $('#sTls').checked = S.tls; $('#sAuto').checked = S.auto; $('#sSub').checked = S.sub;
  $$('#sProto button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === S.proto));
  $('#subRow').hidden = S.proto !== 'mqtt';
  const p = $('#wifiPill'); p.textContent = S.wifi ? 'Wi-Fi conectado' : 'sin Wi-Fi'; p.className = 'pill ' + (S.wifi ? 'ok' : 'bad');
  el.netLbl.textContent = (S.wifi ? 'Wi-Fi' : 'sin Wi-Fi') + ' · puerto ' + port() + (S.tls ? ' TLS' : '');
  el.fanSvg.classList.toggle('on', !!S.devFan); el.fanTxt.textContent = S.devFan ? 'encendido' : 'apagado';
  setTrip(S.proto); fProto.value = S.proto;
}
['#sDev', '#sVar', '#sTemp', '#sTok', '#sValMode', '#sTs'].forEach(s => $(s).addEventListener('input', () => { readForm(); writeForm(); }));
$$('#sProto button').forEach(b => b.addEventListener('click', () => { S.proto = b.dataset.v; writeForm(); }));
$('#sWifi').addEventListener('change', e => { S.wifi = e.target.checked; writeForm(); });
$('#sTls').addEventListener('change', e => { S.tls = e.target.checked; S.portMismatch = false; writeForm(); });
$('#sSub').addEventListener('change', e => { S.sub = e.target.checked; });
$('#sAuto').addEventListener('change', e => {
  S.auto = e.target.checked; clearInterval(S.timer);
  if (S.auto) S.timer = setInterval(() => send({ quiet: true }), 3000);
});

/* paquete que sale del dispositivo */
function buildPacket() {
  const t = tsNow(), tok = tokenStr(), v = valueJson();
  if (S.proto === 'http') {
    const body = t === null ? '{"' + S.vr + '": ' + v + '}' : '{"' + S.vr + '": {"value": ' + v + ', "timestamp": ' + t + '}}';
    return 'POST /api/v1.6/devices/' + S.dev + '/ HTTP/1.1\nHost: ' + HOST + '\nX-Auth-Token: ' + tok + '\nContent-Type: application/json\n\n' + body;
  }
  if (S.proto === 'mqtt') {
    const body = t === null ? '{"' + S.vr + '": ' + v + '}' : '{"' + S.vr + '": {"value": ' + v + ', "timestamp": ' + t + '}}';
    return 'CONNECT  usuario="' + tok + '" contraseña=""\nPUBLISH  tópico=/v1.6/devices/' + S.dev + '\n         carga=' + body;
  }
  return 'mi-app/1.0|POST|' + tok + '|' + S.dev + '=>' + S.vr + ':' + (S.valMode === 'num' ? S.temp.toFixed(1) : 'caliente') + (t === null ? '' : '@' + t) + '|end';
}
const oneLine = pk => pk.split('\n')[0].slice(0, 90);

/* revisiones comunes (lado dispositivo, red, token, nombres) */
function gate(kind) {
  const P = S.proto;
  if (!S.wifi) return { stop: 'dev', msg: 'El dispositivo no tiene Wi-Fi: el paquete ni sale. En el ESP32, HTTPClient devuelve un código negativo y mqtt.connect() devuelve falso.', tag: 'wifi' };
  if (S.portMismatch) return { stop: 'net', msg: 'Handshake fallido: el servidor esperaba texto claro y recibió un saludo TLS. La conexión se cae.', tag: 'tls' };
  if (P === 'tcp' || P === 'udp') {
    const now = Date.now(); S.conns = S.conns.filter(t => now - t < 1000);
    if (S.conns.length >= 5) return { stop: 'net', msg: 'Límite: más de 5 conexiones por segundo desde la misma IP. Este intento se descarta.', tag: 'rate' };
    S.conns.push(now);
  }
  if (S.tok !== 'ok') {
    return { stop: 'srv', tag: 'token', msg: P === 'http' ? '← HTTP 401 Unauthorized: el token no es válido.' : P === 'mqtt' ? '← CONNACK rc=5 (no autorizado). El broker cierra la conexión.' : P === 'tcp' ? '← El servidor cierra la conexión sin guardar nada: token no válido.' : 'Sin respuesta: UDP no confirma. El dato se descarta y el dispositivo no se entera.' };
  }
  if (!labelsOk()) return { stop: 'srv', tag: 'label', msg: P === 'http' ? '← HTTP 4xx: el label tiene mayúsculas o espacios y la URL no apunta a un dispositivo válido.' : P === 'mqtt' ? 'El tópico no corresponde a un dispositivo válido: el dato no se guarda.' : P === 'tcp' ? '← Mensaje rechazado: las etiquetas no admiten mayúsculas ni espacios.' : 'Sin respuesta: UDP no avisa que el mensaje era inválido.' };
  return null;
}

/* animación del paquete */
function fly(to, color) {
  return new Promise(res => {
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) { res(); return; }
    const p = el.pkt, t0 = performance.now(), dur = 700, x0 = 70;
    p.setAttribute('opacity', 1); p.setAttribute('fill', '#fff');
    (function f(t) {
      const k = Math.min(1, (t - t0) / dur); p.setAttribute('cx', x0 + (to - x0) * k);
      if (k < 1) requestAnimationFrame(f); else { p.setAttribute('fill', color); setTimeout(() => { p.setAttribute('opacity', 0); res(); }, 350); }
    })(t0);
  });
}

async function send(opts) {
  opts = opts || {};
  readForm();
  const pk = buildPacket();
  log('dev', '→ ' + S.proto.toUpperCase() + ' · puerto ' + port() + (opts.quiet ? ' · ' + esc(oneLine(pk)) : '<br><span style="color:#ffe3b8">' + esc(pk).replace(/\n/g, '<br>') + '</span>'));
  const g = gate();
  if (!opts.quiet) await fly(g ? (g.stop === 'dev' ? 130 : g.stop === 'net' ? 260 : 450) : 450, g ? '#d9363e' : '#14a36e');
  if (g) {
    log('err', esc(g.msg));
    if (g.tag === 'token') mark('token');
    if (g.tag === 'wifi') mark('wifi');
    if (g.tag === 'rate') mark('rate');
    return;
  }
  /* servidor acepta la conexión: revisa el contenido */
  const P = S.proto;
  if (S.valMode === 'text') {
    log('err', esc(P === 'http' ? '← HTTP 400 Bad Request: value debe ser numérico. El texto va en context.' : P === 'mqtt' ? 'El broker recibe el paquete, pero Ubidots descarta el dot: value debe ser numérico.' : P === 'tcp' ? '← Mensaje rechazado: value debe ser numérico.' : 'Sin respuesta: UDP no avisa que el value era texto.'));
    return;
  }
  const t = tsNow(), wrongDate = S.ts === 's';
  const when = t === null || S.ts === 'ms' ? Date.now() : t;           // segundos leídos como ms: cae en 1970
  const born = !S.cloud[S.dev];
  const d = S.cloud[S.dev] || (S.cloud[S.dev] = { vars: {} });
  const v = d.vars[S.vr] || (d.vars[S.vr] = { dots: [] });
  v.dots.push({ v: S.temp, t: when, odd: wrongDate }); d.updated = Date.now();
  const okMsg = P === 'http' ? '← HTTP 201 Created · guardado en ' + S.dev + '/' + S.vr
    : P === 'mqtt' ? '← CONNACK rc=0 · PUBLISH entregado (QoS 0: el broker no responde)'
    : P === 'tcp' ? '← Dato guardado y conexión cerrada con normalidad'
    : 'Enviado. UDP no responde: si todo está bien, el dato aparece en Devices.';
  log('ok', esc(okMsg) + (born ? ' · <b>dispositivo creado automáticamente</b>' : ''));
  if (wrongDate) log('err', 'Aviso: el timestamp llegó en segundos. Ubidots lo leyó como milisegundos y el dot quedó en enero de 1970.');
  renderCloud();
  mark('ok');
  if (P === 'mqtt') mark('mqtt');
}

/* último valor (el dispositivo pregunta o se suscribe) */
async function askLV() {
  readForm();
  const P = S.proto, tok = tokenStr();
  const req = P === 'http' ? 'GET /api/v1.6/devices/' + S.dev + '/ventilador/lv HTTP/1.1\nX-Auth-Token: ' + tok
    : P === 'mqtt' ? 'CONNECT usuario="' + tok + '"\nSUBSCRIBE /v1.6/devices/' + S.dev + '/ventilador/lv'
    : 'mi-app/1.0|LV|' + tok + '|' + S.dev + ':ventilador|end';
  log('dev', '→ ' + P.toUpperCase() + ' · puerto ' + port() + '<br><span style="color:#ffe3b8">' + esc(req).replace(/\n/g, '<br>') + '</span>');
  const g = gate();
  await fly(g ? (g.stop === 'dev' ? 130 : g.stop === 'net' ? 260 : 450) : 450, g ? '#d9363e' : '#14a36e');
  if (g) { log('err', esc(g.msg)); return; }
  const dv = S.cloud[S.dev], fv = dv && dv.vars.ventilador;
  if (!fv) { log('err', esc(P === 'http' ? '← HTTP 404: la variable «ventilador» todavía no existe. Enciende el interruptor en el Dashboard primero.' : 'Ubidots no tiene la variable «ventilador» todavía. Enciende el interruptor en el Dashboard primero.')); return; }
  const last = fv.dots[fv.dots.length - 1].v;
  log('ok', esc('← ' + last) + ' · último valor de ventilador');
  S.devFan = last; writeForm();
  if (P === 'http') mark('lv');
}

/* orden desde el dashboard hacia el dispositivo */
$('#dFan').addEventListener('change', e => {
  const on = e.target.checked ? 1 : 0;
  const d = S.cloud[S.dev];
  if (!d) { e.target.checked = false; log('err', 'Primero envía un dato para que el dispositivo «' + esc(S.dev) + '» exista en Ubidots.'); return; }
  const fv = d.vars.ventilador || (d.vars.ventilador = { dots: [] });
  fv.dots.push({ v: on, t: Date.now() }); renderCloud();
  log('srv', 'Dashboard: ventilador = ' + on + ' (Ubidots lo guardó en ' + esc(S.dev) + ')');
  if (S.proto === 'mqtt' && S.wifi && S.tok === 'ok' && S.sub && labelsOk() && !S.portMismatch) {
    log('srv', '← PUBLISH /v1.6/devices/' + esc(S.dev) + '/ventilador/lv  «' + on + '»<br>El broker empuja el valor: el dispositivo lo recibe al instante.');
    S.devFan = on; writeForm(); mark('down');
  } else {
    const why = S.proto !== 'mqtt' ? 'con ' + S.proto.toUpperCase() + ' el dispositivo debe preguntar: pulsa «Pedir último valor»'
      : !S.wifi ? 'el dispositivo no tiene Wi-Fi'
      : S.tok !== 'ok' ? 'la conexión MQTT del dispositivo no está autorizada'
      : !S.sub ? 'el dispositivo no está suscrito al tópico'
      : 'el label del dispositivo no es válido';
    log('srv', 'El dispositivo aún no lo sabe: ' + why + '.');
  }
});

/* nube */
let cTab = 'dev';
$('#cTabs').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; cTab = b.dataset.k;
  $$('#cTabs button').forEach(x => x.classList.toggle('on', x === b)); renderCloud();
});
const fmt = ms => { const d = new Date(ms); return d.getFullYear() < 1980 ? d.toLocaleDateString('es-BO') + ' (¡1970!)' : pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
function renderCloud() {
  const names = Object.keys(S.cloud);
  const total = names.reduce((a, n) => a + Object.values(S.cloud[n].vars).reduce((b, v) => b + v.dots.length, 0), 0);
  $('#cloudPill').textContent = total ? total + ' dots' : 'sin datos'; $('#cloudPill').className = 'pill' + (total ? ' ok' : '');
  $('#cDev').hidden = cTab !== 'dev'; $('#cDash').hidden = cTab !== 'dash';
  if (cTab === 'dev') {
    if (!names.length) { $('#cDev').innerHTML = '<div class="empty">Todavía no hay dispositivos. Envía un dato: Ubidots lo creará solo.</div>'; return; }
    $('#cDev').innerHTML = '<div class="tablewrap"><table><thead><tr><th>Dispositivo</th><th>Variables (último valor)</th><th>Último dato</th></tr></thead><tbody>' +
      names.map(n => {
        const d = S.cloud[n];
        const vs = Object.keys(d.vars).map(k => { const dots = d.vars[k].dots, l = dots[dots.length - 1]; return '<span class="pill ' + (k === 'ventilador' ? 'ok' : 'warn') + '" style="margin:0 4px 4px 0">' + esc(k) + ' ' + (k === 'ventilador' ? l.v : Number(l.v).toFixed(1)) + '</span>'; }).join('');
        const last = Object.values(d.vars).flatMap(v => v.dots).sort((a, b) => b.t - a.t)[0];
        return '<tr><td><b>' + esc(n) + '</b></td><td>' + vs + '</td><td>' + fmt(last.t) + '</td></tr>';
      }).join('') + '</tbody></table></div><p style="font-size:.8rem;color:var(--muted);margin:6px 0 0">Amarillo: variables que envía el dispositivo. Verde: la variable <code>ventilador</code>, que escribe el dashboard.</p>';
  } else drawDash();
}
function drawDash() {
  const d = S.cloud[S.dev] || S.cloud[Object.keys(S.cloud)[0]];
  const key = d && (d.vars[S.vr] ? S.vr : Object.keys(d.vars).find(k => k !== 'ventilador'));
  const dots = d && key ? d.vars[key].dots : [];
  $('#tCount').textContent = dots.length;
  $('#tLast').textContent = dots.length ? Number(dots[dots.length - 1].v).toFixed(1) : '—'; $('#tLastU').textContent = dots.length ? '°C' : '';
  const fv = d && d.vars.ventilador; $('#dFan').checked = !!(fv && fv.dots[fv.dots.length - 1].v);
  const c = $('#chart'), x = c.getContext('2d'), W = c.width, H = c.height;
  x.clearRect(0, 0, W, H); x.fillStyle = '#fff'; x.fillRect(0, 0, W, H);
  x.font = '12px Poppins, sans-serif'; x.fillStyle = '#5a6b82';
  if (dots.length < 1) { x.textAlign = 'center'; x.fillText('Envía datos para ver la gráfica', W / 2, H / 2); return; }
  const pts = dots.slice(-20), vs = pts.map(p => p.v), lo = Math.min.apply(null, vs) - 1, hi = Math.max.apply(null, vs) + 1;
  const L = 44, R = 14, T = 16, B = 26, X = i => L + (pts.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (pts.length - 1)), Y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  x.strokeStyle = '#e6eef0'; x.lineWidth = 1; x.textAlign = 'right';
  for (let k = 0; k <= 3; k++) { const v = lo + (hi - lo) * k / 3, y = Y(v); x.beginPath(); x.moveTo(L, y); x.lineTo(W - R, y); x.stroke(); x.fillText(v.toFixed(hi - lo < 6 ? 1 : 0), L - 6, y + 4); }
  x.strokeStyle = '#27c9ac'; x.lineWidth = 3; x.lineJoin = 'round'; x.beginPath();
  pts.forEach((p, i) => i ? x.lineTo(X(i), Y(p.v)) : x.moveTo(X(i), Y(p.v))); x.stroke();
  pts.forEach((p, i) => { x.fillStyle = p.odd ? '#d9363e' : '#e9a96a'; x.beginPath(); x.arc(X(i), Y(p.v), 4.5, 0, 7); x.fill(); });
  x.fillStyle = '#5a6b82'; x.textAlign = 'center'; x.fillText('últimos ' + pts.length + ' dots de ' + key, W / 2, H - 6);
}

/* botones */
$('#bSend').addEventListener('click', () => send());
$('#bHeat').addEventListener('click', () => { S.temp = 38; writeForm(); log('dev', 'Ola de calor: el sensor marca 38.0 °C'); send(); });
$('#bLV').addEventListener('click', askLV);
$('#bBurst').addEventListener('click', () => {
  if (S.proto !== 'tcp' && S.proto !== 'udp') log('srv', 'Una ráfaga se nota en TCP o UDP, que tienen el límite de 5 conexiones por segundo. Cambia la ruta y repite.');
  for (let i = 0; i < 10; i++) setTimeout(() => send({ quiet: true }), i * 60);
});
$('#bClear').addEventListener('click', () => { el.log.innerHTML = ''; });
$('#bCase').addEventListener('click', () => {
  const k = $('#fCase').value;
  S.tok = 'ok'; S.valMode = 'num'; S.ts = 'none'; S.wifi = true; S.portMismatch = false;
  if (!labelsOk()) { S.dev = 'esp32-aula'; S.vr = 'temperatura'; }
  if (k === 'token') S.tok = 'bad';
  if (k === 'wifi') S.wifi = false;
  if (k === 'text') S.valMode = 'text';
  if (k === 'ts') S.ts = 's';
  if (k === 'label') S.dev = 'Esp32 Aula';
  if (k === 'tls') { S.tls = true; S.portMismatch = true; }
  writeForm();
  $('#why').innerHTML = '<b>Caso aplicado.</b> Pulsa <b>Enviar ahora</b> y mira el registro.<br><br><b>Qué lo causa:</b> ' + esc(CASES[k][0]) + '<br><b>Cómo se arregla:</b> ' + esc(CASES[k][1]);
});
$('#bFix').addEventListener('click', () => {
  S.tok = 'ok'; S.valMode = 'num'; S.ts = 'none'; S.wifi = true; S.tls = false; S.portMismatch = false;
  if (!labelsOk()) { S.dev = 'esp32-aula'; S.vr = 'temperatura'; }
  writeForm(); $('#why').innerHTML = 'Todo vuelve a estar bien. Elige otro caso o pulsa <b>Enviar ahora</b>.';
});
$('#bReset').addEventListener('click', () => {
  clearInterval(S.timer);
  Object.assign(S, { proto: 'http', tls: false, portMismatch: false, wifi: true, auto: false, sub: true, dev: 'esp32-aula', vr: 'temperatura', temp: 24, tok: 'ok', valMode: 'num', ts: 'none', cloud: {}, devFan: 0, conns: [], done: {} });
  el.log.innerHTML = ''; $('#dFan').checked = false; writeForm(); renderCloud(); renderChallenges();
  $('#why').innerHTML = 'Elige un caso y pulsa <b>Aplicar caso</b>.';
  log('srv', 'Simulador reiniciado.');
});
writeForm(); renderCloud(); renderChallenges();
log('srv', 'Listo. Pulsa «Enviar ahora» para mandar tu primer dato.');

/* ---------- quiz ---------- */
const QZ = [
  ['¿Dónde viaja el token cuando envías datos por HTTP?', ['En la URL, después del signo ?', 'En la cabecera X-Auth-Token', 'Dentro del JSON como una variable', 'No hace falta si el dispositivo ya existe'], 1, 'Va en la cabecera X-Auth-Token de la petición. Se trata como una contraseña.'],
  ['En MQTT con el broker de Ubidots, ¿qué se usa como usuario?', ['El nombre del dispositivo', 'El correo de la cuenta', 'El token', 'El nombre de la variable'], 2, 'El usuario es el token y la contraseña puede ir vacía.'],
  ['¿Cuál es el puerto de TCP y UDP sin cifrado?', ['1883', '80', '8883', '9012'], 3, 'El 9012 es sin TLS; el 9812 es con TLS.'],
  ['Envías un dato a un device label que no existe. ¿Qué pasa?', ['Ubidots lo crea automáticamente', 'Siempre devuelve un error', 'Se guarda en otro dispositivo', 'Se pierde sin avisar'], 0, 'El dispositivo y la variable se crean solos con el primer dato. Por eso hay que cuidar el label: un error de tipeo crea un dispositivo nuevo.'],
  ['Mandas el timestamp en segundos (10 dígitos). ¿Qué ocurre?', ['Ubidots lo corrige solo', 'El dato queda en una fecha de 1970', 'Se rechaza siempre', 'Se guarda con la hora de mañana'], 1, 'Ubidots espera milisegundos Unix. En segundos, el dot cae en enero de 1970.'],
  ['Quieres que el dispositivo reciba una orden apenas cambie el dashboard. ¿Qué ruta eliges?', ['HTTP, preguntando cada hora', 'UDP, sin confirmación', 'MQTT con suscripción', 'Ninguna: Ubidots no envía órdenes'], 2, 'Con MQTT te suscribes al tópico de la variable y el broker te empuja el valor al instante.']
];
let qi = 0, qs = 0;
function renderQ() {
  const box = $('#quizBox');
  if (qi >= QZ.length) {
    box.innerHTML = '<div class="note ' + (qs >= 5 ? 'good' : 'info') + '"><b>Resultado: ' + qs + ' de ' + QZ.length + '.</b> ' + (qs >= 5 ? '¡Dominas la conexión!' : 'Repasa las rutas y el simulador, y vuelve a intentarlo.') + '</div><button class="btn dark small" type="button" id="qAgain">Repetir</button>';
    $('#qAgain').addEventListener('click', () => { qi = 0; qs = 0; renderQ(); }); return;
  }
  const q = QZ[qi];
  box.innerHTML = '<div class="progress" aria-hidden="true"><i style="width:' + (qi / QZ.length * 100) + '%"></i></div><div class="quiz-q">' + (qi + 1) + '. ' + q[0] + '</div><div class="opts">' +
    q[1].map((o, i) => '<button class="opt" type="button" data-i="' + i + '">' + esc(o) + '</button>').join('') + '</div><div class="explain" id="qEx" aria-live="polite"></div>';
  $$('.opt', box).forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.i; $$('.opt', box).forEach(x => { x.disabled = true; if (+x.dataset.i === q[2]) x.classList.add('good'); });
    if (i === q[2]) qs++; else b.classList.add('wrong');
    $('#qEx').innerHTML = esc(q[3]) + '<br><br><button class="btn dark small" type="button" id="qNext">' + (qi === QZ.length - 1 ? 'Ver resultado' : 'Siguiente') + '</button>';
    $('#qNext').addEventListener('click', () => { qi++; renderQ(); });
  }));
}
renderQ();
})();
