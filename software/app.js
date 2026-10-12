const config = window.SAFE_GAS_CONFIG;
const API = config.API_BASE_URL.replace(/\/$/, "");

const state = {
  status: null,
  leaks: [],
  commands: [],
  telemetry: [],
  consumptionRange: "day",
  commandPending: false,
  refreshTimer: null,
};

const byId = (id) => document.getElementById(id);
const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  dateStyle: "short",
  timeStyle: "medium",
});
const shortDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const numberFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const contentType = response.headers.get("content-type") ?? "";
  const payload = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(payload?.message ?? `Falha na requisição (${response.status})`);
    error.code = payload?.code;
    throw error;
  }
  return payload;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date);
}

function formatNumber(value, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${numberFormatter.format(value)}${suffix}` : "—";
}

function setBadge(element, text, type) {
  element.textContent = text;
  element.className = `badge ${type}`;
}

let toastTimer;
function showToast(message, error = false) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.className = `toast${error ? " error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 4500);
}

function renderStatus(status) {
  state.status = status;
  setBadge(byId("backend-badge"), "Backend conectado", "ok");
  setBadge(byId("central-badge"), status.deviceOnline ? "ESP1 online" : "ESP1 offline", status.deviceOnline ? "ok" : "danger");

  byId("last-update").textContent = status.lastSeenAt ? `Última medição: ${formatDate(status.lastSeenAt)}` : "Nenhuma medição recebida";
  byId("gas-percentage").textContent = formatNumber(status.gasPercentage, "%");
  byId("gas-weight").textContent = `${formatNumber(status.gasKg, " kg")} disponíveis`;
  byId("gas-progress").style.width = `${Math.min(100, Math.max(0, status.gasPercentage ?? 0))}%`;
  byId("total-weight").textContent = formatNumber(status.totalWeightKg, " kg");
  byId("valve-state").textContent = valveLabel(status.valveState);
  byId("mq2-value").textContent = formatNumber(status.mq2Raw);
  byId("leak-state").textContent = status.leakActive ? "Vazamento detectado" : "Nenhum vazamento ativo";
  byId("esp2-state").textContent = status.esp2Online ? "Online" : "Offline";
  renderAlert(status);
  renderValveControls();
}

function renderAlert(status) {
  const banner = byId("alert-banner");
  const button = byId("banner-ack-button");
  banner.classList.remove("cleared");
  button.classList.add("hidden");
  button.dataset.leakId = "";

  if (status.leakActive) {
    banner.classList.remove("hidden");
    byId("alert-title").textContent = "Vazamento detectado";
    byId("alert-message").textContent = "O ESP1 deve manter a válvula fechada. Aguarde o MQ-2 voltar ao estado normal.";
  } else if (status.unacknowledgedLeak) {
    banner.classList.remove("hidden");
    banner.classList.add("cleared");
    byId("alert-title").textContent = "Vazamento encerrado — reconhecimento necessário";
    byId("alert-message").textContent = "Reconheça o alerta para liberar futuros comandos de abertura.";
    if (status.unacknowledgedLeak.endedAt) {
      button.classList.remove("hidden");
      button.dataset.leakId = status.unacknowledgedLeak.id;
      const remaining = safetyCooldownSeconds(status.unacknowledgedLeak);
      button.disabled = remaining > 0 || !status.esp2Online;
      button.textContent = !status.esp2Online
        ? "ESP2 offline"
        : remaining > 0
          ? `Aguarde ${remaining}s`
          : "Reconhecer alerta";
    }
  } else {
    banner.classList.add("hidden");
  }
}

function renderValveControls() {
  const open = byId("open-valve");
  const close = byId("close-valve");
  const status = state.status;
  if (!status) return;

  const openingBlocked = !status.deviceOnline || !status.esp2Online || status.leakActive || Boolean(status.unacknowledgedLeak) || state.commandPending;
  open.disabled = openingBlocked || status.valveState === "OPEN";
  close.disabled = !status.deviceOnline || state.commandPending || status.valveState === "CLOSED";

  if (!status.deviceOnline) byId("valve-help").textContent = "A central está offline; nenhum comando pode ser enviado.";
  else if (!status.esp2Online) byId("valve-help").textContent = "O ESP2 está offline ou aquecendo; a abertura permanece bloqueada.";
  else if (status.leakActive) byId("valve-help").textContent = "A abertura está bloqueada enquanto houver vazamento.";
  else if (status.unacknowledgedLeak) byId("valve-help").textContent = "Reconheça o alerta encerrado antes de abrir.";
  else if (state.commandPending) byId("valve-help").textContent = "Aguardando confirmação do ESP1.";
  else byId("valve-help").textContent = "O estado mostrado corresponde ao relé reportado pelo ESP1.";
}

function valveLabel(value) {
  return ({ OPEN: "Aberta", CLOSED: "Fechada", UNKNOWN: "Desconhecida" })[value] ?? "Desconhecida";
}

function actionLabel(value) {
  return ({ OPEN: "Abrir", CLOSE: "Fechar", RESET_SAFETY: "Reconhecer alerta" })[value] ?? value;
}

function commandStatus(value) {
  return ({ PENDING: "Pendente", APPLIED: "Aplicado", REJECTED: "Rejeitado", FAILED: "Falhou", EXPIRED: "Expirado" })[value] ?? value;
}

function statusPill(text, type) {
  const span = document.createElement("span");
  span.className = `status-pill ${type}`;
  span.textContent = text;
  return span;
}

function addCell(row, value) {
  const cell = document.createElement("td");
  if (value instanceof Node) cell.append(value);
  else cell.textContent = String(value);
  row.append(cell);
  return cell;
}

function renderLeaks(leaks) {
  state.leaks = leaks;
  const body = byId("leaks-table");
  body.replaceChildren();
  byId("leaks-empty").classList.toggle("hidden", leaks.length > 0);

  for (const leak of leaks) {
    const row = document.createElement("tr");
    addCell(row, formatDate(leak.startedAt));
    addCell(row, formatDate(leak.endedAt));
    addCell(row, leak.endedAt ? formatDuration(new Date(leak.endedAt) - new Date(leak.startedAt)) : "Em andamento");
    addCell(row, leak.peakMq2Raw);
    const situation = !leak.endedAt
      ? statusPill("Ativo", "danger")
      : leak.acknowledgedAt
        ? statusPill("Reconhecido", "ok")
        : statusPill("Aguardando reconhecimento", "warning");
    addCell(row, situation);
    const actionCell = addCell(row, "");
    if (leak.endedAt && !leak.acknowledgedAt) {
      const button = document.createElement("button");
      button.className = "button secondary acknowledge-button";
      button.type = "button";
      button.dataset.leakId = leak.id;
      const remaining = safetyCooldownSeconds(leak);
      button.disabled = remaining > 0 || state.status?.esp2Online === false;
      button.textContent = state.status?.esp2Online === false
        ? "ESP2 offline"
        : remaining > 0
          ? `Aguarde ${remaining}s`
          : "Reconhecer";
      actionCell.append(button);
    } else actionCell.textContent = "—";
    body.append(row);
  }
}

function formatDuration(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return minutes > 0 ? `${minutes} min ${seconds % 60} s` : `${seconds} s`;
}

function safetyCooldownSeconds(leak) {
  if (!leak?.endedAt) return 0;
  const elapsed = Date.now() - new Date(leak.endedAt).getTime();
  return Math.max(0, Math.ceil((config.SAFETY_RESET_DELAY_MS - elapsed) / 1000));
}

function renderCommands(commands) {
  state.commands = commands;
  state.commandPending = commands.some((command) => command.status === "PENDING");
  const body = byId("commands-table");
  body.replaceChildren();
  byId("commands-empty").classList.toggle("hidden", commands.length > 0);

  for (const command of commands.slice(0, 12)) {
    const row = document.createElement("tr");
    addCell(row, formatDate(command.requestedAt));
    addCell(row, actionLabel(command.action));
    const type = command.status === "APPLIED" ? "ok" : command.status === "PENDING" ? "warning" : "danger";
    const result = statusPill(commandStatus(command.status), type);
    if (command.reason) result.title = command.reason;
    addCell(row, result);
    addCell(row, valveLabel(command.reportedValveState));
    body.append(row);
  }
  renderValveControls();
}

function renderConsumption(data) {
  byId("consumption-total").textContent = formatNumber(data.totalKg, " kg");
  const chart = byId("consumption-chart");
  chart.replaceChildren();
  chart.classList.toggle("empty-state", data.buckets.length === 0);
  if (data.buckets.length === 0) {
    chart.textContent = "Nenhum consumo registrado neste período.";
    return;
  }

  const maximum = Math.max(...data.buckets.map((bucket) => bucket.consumptionKg), 0.001);
  for (const bucket of data.buckets) {
    const item = document.createElement("div");
    item.className = "bar-item";
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${numberFormatter.format(bucket.consumptionKg)} kg`;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(2, (bucket.consumptionKg / maximum) * 155)}px`;
    bar.title = `${formatDate(bucket.start)}: ${value.textContent}`;
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = shortDateFormatter.format(new Date(bucket.start));
    item.append(value, bar, label);
    chart.append(item);
  }
}

function renderGasHistory(readings) {
  state.telemetry = readings;
  const container = byId("gas-history-chart");
  container.replaceChildren();
  const ordered = [...readings].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt)).slice(-80);
  container.classList.toggle("empty-state", ordered.length === 0);
  if (ordered.length === 0) {
    container.textContent = "Nenhuma leitura registrada.";
    return;
  }

  const width = 600;
  const height = 200;
  const pad = 16;
  const values = ordered.map((reading) => reading.gasKg);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = ordered.map((reading, index) => {
    const x = pad + (index / Math.max(1, ordered.length - 1)) * (width - pad * 2);
    const y = height - pad - ((reading.gasKg - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Histórico de gás restante entre ${numberFormatter.format(min)} e ${numberFormatter.format(max)} kg`);
  for (const y of [40, 80, 120, 160]) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", "0"); line.setAttribute("x2", String(width)); line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y));
    line.setAttribute("class", "chart-grid");
    svg.append(line);
  }
  const area = document.createElementNS(ns, "polygon");
  area.setAttribute("points", `${pad},${height - pad} ${points.join(" ")} ${width - pad},${height - pad}`);
  area.setAttribute("class", "chart-area");
  const polyline = document.createElementNS(ns, "polyline");
  polyline.setAttribute("points", points.join(" "));
  polyline.setAttribute("class", "chart-line");
  svg.append(area, polyline);
  container.append(svg);
}

function fillSettings(settings) {
  const form = byId("settings-form");
  if (form.matches(":focus-within")) return;
  byId("tare-kg").value = settings.tareKg;
  byId("capacity-kg").value = settings.capacityKg;
  byId("noise-kg").value = settings.noiseToleranceKg;
  byId("refill-kg").value = settings.refillThresholdKg;
}

async function refreshStatus() {
  try {
    renderStatus(await api("/api/status"));
  } catch (error) {
    setBadge(byId("backend-badge"), "Backend indisponível", "danger");
    setBadge(byId("central-badge"), "Central desconhecida", "neutral");
    throw error;
  }
}

async function refreshConsumption() {
  renderConsumption(await api(`/api/gas/consumption?range=${state.consumptionRange}`));
}

async function refreshAll(showSuccess = false) {
  const jobs = [
    refreshStatus(),
    api("/api/leaks?limit=100").then(renderLeaks),
    api("/api/valve/commands?limit=100").then(renderCommands),
    api("/api/gas/history?limit=500").then(renderGasHistory),
    api("/api/settings").then(fillSettings),
    refreshConsumption(),
  ];
  const results = await Promise.allSettled(jobs);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) showToast("Não foi possível carregar todos os dados do backend.", true);
  else if (showSuccess) showToast("Dados atualizados.");
}

function scheduleRefresh() {
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => void refreshAll(), 250);
}

async function sendValveCommand(action) {
  if (action === "OPEN" && !window.confirm("Confirma a abertura da válvula?")) return;
  state.commandPending = true;
  renderValveControls();
  try {
    await api("/api/valve/commands", { method: "POST", body: JSON.stringify({ action }) });
    showToast(`Comando para ${action === "OPEN" ? "abrir" : "fechar"} enviado. Aguardando ESP1.`);
    scheduleRefresh();
  } catch (error) {
    state.commandPending = false;
    renderValveControls();
    showToast(error.message, true);
  }
}

async function acknowledgeLeak(leakId) {
  if (!leakId) return;
  const leak = state.leaks.find((item) => item.id === leakId) ?? state.status?.unacknowledgedLeak;
  const remaining = safetyCooldownSeconds(leak);
  if (remaining > 0) {
    showToast(`Aguarde ${remaining} segundo${remaining === 1 ? "" : "s"} sem vazamento.`, true);
    return;
  }
  try {
    await api(`/api/leaks/${leakId}/acknowledge`, { method: "POST" });
    showToast("Reconhecimento enviado ao ESP1.");
    scheduleRefresh();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const payload = Object.fromEntries([...form.entries()].map(([key, value]) => [key, Number(value)]));
  try {
    await api("/api/settings", { method: "PUT", body: JSON.stringify(payload) });
    showToast("Configurações da balança salvas.");
    await refreshAll();
  } catch (error) {
    showToast(error.message, true);
  }
}

async function connectSocket() {
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${API}/socket.io/socket.io.js`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    const socket = window.io(API, { transports: ["websocket", "polling"] });
    socket.on("connect", () => setBadge(byId("socket-badge"), "Tempo real conectado", "ok"));
    socket.on("disconnect", () => setBadge(byId("socket-badge"), "Tempo real desconectado", "warning"));
    socket.on("connect_error", () => setBadge(byId("socket-badge"), "Tempo real indisponível", "warning"));
    for (const event of [
      "telemetry.updated", "valve.updated", "leak.started", "leak.cleared",
      "leak.acknowledged", "command.updated", "device.connectivity",
    ]) socket.on(event, scheduleRefresh);
  } catch {
    setBadge(byId("socket-badge"), "Tempo real indisponível", "warning");
  }
}

byId("open-valve").addEventListener("click", () => void sendValveCommand("OPEN"));
byId("close-valve").addEventListener("click", () => void sendValveCommand("CLOSE"));
byId("refresh-button").addEventListener("click", () => void refreshAll(true));
byId("settings-form").addEventListener("submit", saveSettings);
byId("banner-ack-button").addEventListener("click", (event) => void acknowledgeLeak(event.currentTarget.dataset.leakId));
byId("leaks-table").addEventListener("click", (event) => {
  const button = event.target.closest(".acknowledge-button");
  if (button) void acknowledgeLeak(button.dataset.leakId);
});
for (const button of document.querySelectorAll(".period-button")) {
  button.addEventListener("click", () => {
    state.consumptionRange = button.dataset.range;
    document.querySelectorAll(".period-button").forEach((item) => {
      const selected = item === button;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-pressed", String(selected));
    });
    void refreshConsumption().catch((error) => showToast(error.message, true));
  });
}

void refreshAll();
void connectSocket();
setInterval(() => void refreshAll(), config.REFRESH_INTERVAL_MS);
setInterval(() => {
  if (state.status) renderAlert(state.status);
  if (state.leaks.length) renderLeaks(state.leaks);
}, 1000);
