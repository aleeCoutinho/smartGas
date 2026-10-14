const config = window.SAFE_GAS_CONFIG;
const API = config.API_BASE_URL.replace(/\/$/, "");

const state = {
  status: null,
  leaks: [],
  commands: [],
  telemetry: [],
  cylinders: [],
  cylinderFilter: "active",
  consumptionRange: "day",
  commandPending: false,
  replacement: null,
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
  const headers = { ...options.headers };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  const token = localStorage.getItem("smartgas_token");
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem("smartgas_token");
    localStorage.removeItem("smartgas_session");
    window.location.href = "../Login/login.html";
    throw new Error("Sessão inválida ou sem acesso ao painel.");
  }
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

function renderCylinders(cylinders) {
  state.cylinders = cylinders;
  const select = byId("cylinder-filter");
  const current = state.cylinderFilter;
  select.replaceChildren();
  const options = [
    { value: "active", label: "Botijão atual" },
    ...cylinders.map((cylinder) => ({ value: String(cylinder.id), label: `Botijão ${cylinder.number}` })),
  ];
  for (const option of options) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    select.append(element);
  }
  select.value = options.some((option) => option.value === current) ? current : "active";
  state.cylinderFilter = select.value;
  const active = cylinders.find((cylinder) => !cylinder.removedAt) ?? cylinders.at(-1);
  byId("active-cylinder-title").textContent = active ? `Botijão ${active.number}` : "Botijão atual";
  byId("active-cylinder-installed").textContent = active ? `Instalado em ${formatDate(active.installedAt)}` : "Nenhum ciclo selecionado";
  if (active) {
    byId("initial-gas-kg").value = active.initialGasKg ?? "";
    byId("initial-weight-kg").value = active.initialWeightKg ?? "";
  }
  if (!state.replacement) byId("replacement-start").disabled = !active;
}

function renderReplacement(replacement) {
  state.replacement = replacement;
  const pending = Boolean(replacement);
  const stable = Boolean(replacement?.weightStable);
  byId("replacement-start").disabled = pending;
  byId("replacement-cancel").disabled = !pending;
  byId("replace-cylinder-button").disabled = !pending || !stable;
  byId("replacement-gas").disabled = !pending || !stable;
  if (!pending) {
    byId("replacement-weight-status").textContent = "A balança será lida pelo sistema após iniciar.";
    byId("replacement-help").textContent = "Inicie a troca, coloque o botijão na balança e aguarde uma leitura estável.";
    return;
  }
  byId("replacement-weight-status").textContent = replacement.measuredWeightKg == null
    ? "Aguardando leitura da balança..."
    : `Peso total medido: ${formatNumber(replacement.measuredWeightKg, " kg")} (${stable ? "leitura estável" : "estabilizando"})`;
  byId("replacement-help").textContent = stable
    ? "Informe o gás inicial e confirme a troca."
    : "Mantenha o botijão parado até a leitura ficar estável.";
  renderValveControls();
}

function cylinderQuery() {
  if (state.cylinderFilter !== "active") return `&cylinderId=${encodeURIComponent(state.cylinderFilter)}`;
  const active = state.cylinders.find((cylinder) => !cylinder.removedAt);
  return active ? `&cylinderId=${active.id}` : "";
}

function activeCylinderQuery() {
  return cylinderQuery();
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
  close.disabled = !status.deviceOnline || state.commandPending || state.replacement || status.valveState === "CLOSED";
  if (state.replacement) {
    open.disabled = true;
    byId("valve-help").textContent = "Finalize ou cancele a troca do botijão antes de enviar comandos.";
    return;
  }

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
  const now = Date.now();
  const currentIndex = data.buckets.findIndex((bucket, index) => {
    const start = new Date(bucket.start).getTime();
    const next = index + 1 < data.buckets.length ? new Date(data.buckets[index + 1].start).getTime() : Infinity;
    return now >= start && now < next;
  });
  const capitalize = (value) => value.charAt(0).toUpperCase() + value.slice(1);
  const consumptionLabel = (start) => {
    const date = new Date(start);
    if (data.range === "day") {
      return `${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hourCycle: "h23" }).format(date)}h`;
    }
    if (data.range === "week") {
      return capitalize(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(date));
    }
    return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric" }).format(date);
  };
  let currentItem;
  for (const [index, bucket] of data.buckets.entries()) {
    const item = document.createElement("div");
    item.className = "bar-item";
    if (index === currentIndex) {
      item.classList.add("current");
      item.setAttribute("aria-current", "time");
      currentItem = item;
    }
    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = `${numberFormatter.format(bucket.consumptionKg)} kg`;
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${Math.max(2, (bucket.consumptionKg / maximum) * 155)}px`;
    bar.title = `${formatDate(bucket.start)}: ${value.textContent}`;
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = consumptionLabel(bucket.start);
    item.append(value, bar, label);
    chart.append(item);
  }
  if (currentItem) requestAnimationFrame(() => currentItem.scrollIntoView({ block: "nearest", inline: "center" }));
}

function renderGasHistory(readings) {
  state.telemetry = readings;
  const container = byId("gas-history-chart");
  container.replaceChildren();
  const ordered = [...readings].sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt)).slice(-500);
  container.classList.toggle("empty-state", ordered.length === 0);
  if (ordered.length === 0) {
    container.textContent = "Nenhuma leitura registrada.";
    return;
  }

  const width = 760;
  const height = 250;
  const pad = { top: 16, right: 18, bottom: 34, left: 46 };
  const values = ordered.map((reading) => reading.gasKg);
  const selectedCylinder = state.cylinderFilter === "active"
    ? state.cylinders.find((cylinder) => !cylinder.removedAt)
    : state.cylinders.find((cylinder) => String(cylinder.id) === String(state.cylinderFilter));
  const cycleStart = selectedCylinder?.installedAt ? new Date(selectedCylinder.installedAt) : new Date(ordered[0].receivedAt);
  const cycleEnd = selectedCylinder?.removedAt ? new Date(selectedCylinder.removedAt) : new Date();
  const cycleStartMs = cycleStart.getTime();
  const cycleEndMs = Math.max(cycleStartMs + 1, cycleEnd.getTime());
  const selectedCapacity = selectedCylinder?.capacityKg ?? 0;
  const min = Math.min(...values);
  const max = Math.max(...values, selectedCapacity);
  const span = max - Math.min(0, min) || 1;
  const points = ordered.map((reading, index) => {
    const readingMs = new Date(reading.receivedAt).getTime();
    const progress = Math.min(1, Math.max(0, (readingMs - cycleStartMs) / (cycleEndMs - cycleStartMs)));
    const x = pad.left + progress * (width - pad.left - pad.right);
    const y = height - pad.bottom - ((reading.gasKg - Math.min(0, min)) / span) * (height - pad.top - pad.bottom);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `Histórico de gás restante entre ${numberFormatter.format(min)} e ${numberFormatter.format(max)} kg`);
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((ratio) => Math.min(max, Math.max(0, max * ratio)));
  for (const value of gridValues) {
    const y = height - pad.bottom - (value / span) * (height - pad.top - pad.bottom);
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", String(pad.left)); line.setAttribute("x2", String(width - pad.right)); line.setAttribute("y1", String(y)); line.setAttribute("y2", String(y));
    line.setAttribute("class", "chart-grid");
    svg.append(line);
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(pad.left - 8)); label.setAttribute("y", String(y + 4));
    label.setAttribute("text-anchor", "end"); label.setAttribute("class", "chart-axis-label");
    label.textContent = `${numberFormatter.format(value)} kg`;
    svg.append(label);
  }
  const area = document.createElementNS(ns, "polygon");
  area.setAttribute("points", `${pad.left},${height - pad.bottom} ${points.join(" ")} ${width - pad.right},${height - pad.bottom}`);
  area.setAttribute("class", "chart-area");
  const polyline = document.createElementNS(ns, "polyline");
  polyline.setAttribute("points", points.join(" "));
  polyline.setAttribute("class", "chart-line");
  svg.append(area, polyline);
  const dateLabels = [
    { date: cycleStart, x: pad.left, anchor: "start" },
    { date: new Date((cycleStartMs + cycleEndMs) / 2), x: (pad.left + width - pad.right) / 2, anchor: "middle" },
    { date: cycleEnd, x: width - pad.right, anchor: "end" },
  ];
  for (const item of dateLabels) {
    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(item.x)); label.setAttribute("y", String(height - 8));
    label.setAttribute("text-anchor", item.anchor);
    label.setAttribute("class", "chart-axis-label");
    label.textContent = shortDateFormatter.format(item.date);
    svg.append(label);
  }
  container.append(svg);
}

function fillSettings(settings) {
  const form = byId("settings-form");
  if (form.matches(":focus-within")) return;
  byId("tare-kg").value = settings.tareKg;
  byId("capacity-kg").value = settings.capacityKg;
  byId("initial-gas-kg").value = settings.initialGasKg ?? "";
  byId("initial-weight-kg").value = settings.initialWeightKg ?? "";
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
  renderConsumption(await api(`/api/gas/consumption?range=${state.consumptionRange}&scope=all`));
}

async function refreshGasHistory() {
  renderGasHistory(await api(`/api/gas/history?limit=500${activeCylinderQuery()}`));
}

async function refreshAll(showSuccess = false) {
  const jobs = [
    refreshStatus(),
    api("/api/cylinders").then((cylinders) => {
      renderCylinders(cylinders);
      return refreshGasHistory();
    }),
    api("/api/cylinders/replacement").then(renderReplacement),
    api(`/api/leaks?limit=100${cylinderQuery()}`).then(renderLeaks),
    api(`/api/valve/commands?limit=100${cylinderQuery()}`).then(renderCommands),
    api("/api/settings").then(fillSettings),
    refreshConsumption(),
  ];
  const results = await Promise.allSettled(jobs);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) showToast("Não foi possível carregar todos os dados do backend.", true);
  else if (showSuccess) showToast("Dados atualizados.");
}

async function replaceCylinder() {
  const initialGasKg = Number(byId("replacement-gas").value);
  if (!Number.isFinite(initialGasKg)) {
    showToast("Informe o gás inicial do novo botijão.", true);
    return;
  }
  if (!window.confirm("Confirma a troca do botijão? O ciclo atual será encerrado.")) return;
  try {
    await api("/api/cylinders/replacement/confirm", { method: "POST", body: JSON.stringify({ initialGasKg }) });
    byId("replacement-gas").value = "";
    showToast("Troca de botijão registrada.");
    await refreshAll();
  } catch (error) { showToast(error.message, true); }
}

async function startReplacement() {
  try {
    await api("/api/cylinders/replacement/start", { method: "POST" });
    showToast("Troca iniciada. Coloque o botijão na balança.");
    await refreshAll();
  } catch (error) { showToast(error.message, true); }
}

async function cancelReplacement() {
  try {
    await api("/api/cylinders/replacement/cancel", { method: "POST" });
    byId("replacement-gas").value = "";
    showToast("Troca cancelada.");
    await refreshAll();
  } catch (error) { showToast(error.message, true); }
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
    if (!localStorage.getItem("smartgas_token")) {
      window.location.href = "../Login/login.html";
      return;
    }
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `${API}/socket.io/socket.io.js`;
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    const socket = window.io(API, { transports: ["websocket", "polling"], auth: { token: localStorage.getItem("smartgas_token") } });
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
byId("replace-cylinder-button").addEventListener("click", () => void replaceCylinder());
byId("replacement-start").addEventListener("click", () => void startReplacement());
byId("replacement-cancel").addEventListener("click", () => void cancelReplacement());
byId("cylinder-filter").addEventListener("change", (event) => {
  state.cylinderFilter = event.currentTarget.value;
  void refreshAll();
});
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
