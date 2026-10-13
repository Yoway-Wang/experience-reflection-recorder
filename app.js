const STORAGE_KEY = "experience-reflection-recorder-v1";
const CLOUD_TABLE = "experience_records";
const CLOUD_SAVE_DELAY = 900;

const DEFAULT_GROUPS = [
  { id: "algorithm", label: "算法", exportName: "Algorithm", color: "#9bb7d4", locked: true },
  { id: "software", label: "软件", exportName: "Software", color: "#8fb996", locked: true },
  { id: "mechanics", label: "机械", exportName: "Mechanics", color: "#d8b28c", locked: true },
  { id: "circuit", label: "电路", exportName: "Circuit", color: "#7fb7b1", locked: true },
  { id: "writing", label: "写作", exportName: "Writing", color: "#d7a3b3", locked: true },
  { id: "custom", label: "自定义", exportName: "Custom", color: "#b8a7d9", locked: false }
];

const COLOR_PRESETS = [
  { name: "Sky", value: "#9bb7d4" },
  { name: "Sage", value: "#8fb996" },
  { name: "Sand", value: "#d8b28c" },
  { name: "Teal", value: "#7fb7b1" },
  { name: "Rose", value: "#d7a3b3" },
  { name: "Lavender", value: "#b8a7d9" },
  { name: "Peach", value: "#e2a98f" },
  { name: "Mint", value: "#9bcfbd" },
  { name: "Slate", value: "#9ba7b5" },
  { name: "Coral", value: "#d98f87" },
  { name: "Olive", value: "#a9b879" },
  { name: "Mauve", value: "#c49ab5" }
];

const LEGACY_GROUP_COLORS = {
  algorithm: "#e8edf6",
  software: "#e6f0e8",
  mechanics: "#f1eadf",
  circuit: "#e6f1ef",
  writing: "#f2e8ec",
  custom: "#eceaf2"
};

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "were", "was", "are", "not",
  "but", "when", "then", "than", "into", "about", "because", "after", "before",
  "problem", "cause", "solution", "takeaway", "issue", "learned", "using", "use",
  "could", "would", "should", "have", "has", "had", "did", "does", "can", "need"
]);

const NO_PROJECT = "__no_project__";

let state = loadState();
let activeGroup = "all";
let activeProject = "all";
let selectedIds = new Set();
let cloudClient = null;
let cloudUser = null;
let cloudSaveTimer = null;
let isApplyingCloudState = false;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  renderAll();
  initCloudSync();

  if (state.settings.openCardOnLaunch) {
    window.setTimeout(() => openEntryModal(), 220);
  }
});

function bindElements() {
  [
    "launchToggle", "newEntryBtn", "manageGroupsBtn", "groupFilters", "projectCount", "projectFilters", "searchInput", "sortSelect",
    "selectVisibleBtn", "clearSelectionBtn", "activeContext", "entryList",
    "selectionInfo", "exportTxtBtn", "exportPdfBtn", "backupBtn", "importInput",
    "cloudStatus", "cloudEmail", "cloudSignInBtn", "cloudSyncBtn", "cloudSignOutBtn", "cloudMessage",
    "summaryBtn", "summaryOutput", "copySummaryBtn", "entryModal", "entryForm",
    "entryModalTitle", "entryId", "entryProject", "entryProjectQuick", "entryGroup", "entryTime",
    "entryProblem", "entryCause", "entrySolution", "entryTakeaway", "closeEntryModal", "cancelEntryBtn",
    "deleteEntryBtn", "groupModal", "groupEditorList", "addGroupForm", "newGroupLabel",
    "newGroupExport", "newGroupColor", "newGroupPreset", "closeGroupModal", "resetGroupsBtn", "saveGroupsBtn"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function bindEvents() {
  els.launchToggle.addEventListener("change", () => {
    state.settings.openCardOnLaunch = els.launchToggle.checked;
    saveState();
  });

  els.newEntryBtn.addEventListener("click", () => {
    const preferredGroup = activeGroup === "all" ? state.settings.lastGroupId : activeGroup;
    openEntryModal(null, preferredGroup);
  });

  els.manageGroupsBtn.addEventListener("click", openGroupModal);
  els.closeGroupModal.addEventListener("click", closeGroupModal);
  els.saveGroupsBtn.addEventListener("click", saveGroupChanges);
  els.resetGroupsBtn.addEventListener("click", resetGroups);
  els.addGroupForm.addEventListener("submit", addGroup);
  els.newGroupPreset.addEventListener("change", () => {
    if (els.newGroupPreset.value) els.newGroupColor.value = els.newGroupPreset.value;
  });

  els.searchInput.addEventListener("input", renderEntries);
  els.sortSelect.addEventListener("change", renderEntries);
  els.entryProjectQuick.addEventListener("change", () => {
    if (els.entryProjectQuick.value) els.entryProject.value = els.entryProjectQuick.value;
  });
  els.selectVisibleBtn.addEventListener("click", selectVisibleEntries);
  els.clearSelectionBtn.addEventListener("click", () => {
    selectedIds.clear();
    renderEntries();
    renderSelectionInfo();
  });

  els.exportTxtBtn.addEventListener("click", exportTxt);
  els.exportPdfBtn.addEventListener("click", exportPdf);
  els.backupBtn.addEventListener("click", backupJson);
  els.importInput.addEventListener("change", importJson);
  els.cloudSignInBtn.addEventListener("click", sendCloudLoginLink);
  els.cloudSyncBtn.addEventListener("click", syncCloudNow);
  els.cloudSignOutBtn.addEventListener("click", signOutCloud);

  els.summaryBtn.addEventListener("click", generateSmartSummary);
  els.copySummaryBtn.addEventListener("click", copySummary);

  els.entryForm.addEventListener("submit", saveEntryFromForm);
  els.closeEntryModal.addEventListener("click", closeEntryModal);
  els.cancelEntryBtn.addEventListener("click", closeEntryModal);
  els.deleteEntryBtn.addEventListener("click", deleteCurrentEntry);

  els.entryModal.addEventListener("click", (event) => {
    if (event.target === els.entryModal) closeEntryModal();
  });
  els.groupModal.addEventListener("click", (event) => {
    if (event.target === els.groupModal) closeGroupModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEntryModal();
      closeGroupModal();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && !els.entryModal.hidden) {
      event.preventDefault();
      els.entryForm.requestSubmit();
    }
  });
}

function loadState() {
  const fallback = {
    groups: structuredClone(DEFAULT_GROUPS),
    entries: [],
    settings: {
      openCardOnLaunch: true,
      lastGroupId: "algorithm"
    }
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!saved || !Array.isArray(saved.entries)) return fallback;
    return {
      groups: normalizeGroups(saved.groups),
      entries: Array.isArray(saved.entries) ? migrateEntries(saved.entries) : [],
      settings: {
        ...fallback.settings,
        ...(saved.settings || {})
      }
    };
  } catch {
    return fallback;
  }
}

function normalizeGroups(groups) {
  if (!Array.isArray(groups) || groups.length === 0) return structuredClone(DEFAULT_GROUPS);
  const map = new Map(groups.map((group) => [group.id, group]));
  const merged = DEFAULT_GROUPS.map((defaultGroup) => {
    const savedGroup = map.get(defaultGroup.id) || {};
    const savedColor = normalizeColor(savedGroup.color, defaultGroup.color);
    const legacyColor = LEGACY_GROUP_COLORS[defaultGroup.id];
    const color = legacyColor && savedColor.toLowerCase() === legacyColor.toLowerCase()
      ? defaultGroup.color
      : savedColor;
    return {
      ...defaultGroup,
      ...savedGroup,
      color,
      locked: defaultGroup.locked
    };
  });

  groups.forEach((group) => {
    if (!merged.some((item) => item.id === group.id)) {
      merged.push({
        id: group.id || makeId("group"),
        label: group.label || group.exportName || "自定义",
        exportName: group.exportName || group.label || "Custom",
        color: normalizeColor(group.color, "#eceaf2"),
        locked: false
      });
    }
  });
  return merged;
}

function migrateEntries(entries) {
  return entries.map((entry) => ({
    ...entry,
    project: (entry.project || entry.title || "").trim(),
    timeSpent: (entry.timeSpent || "").trim()
  }));
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!isApplyingCloudState) queueCloudSave();
}

function getCloudConfig() {
  return window.EXPERIENCE_RECORDER_CLOUD || {};
}

function isCloudConfigured() {
  const config = getCloudConfig();
  return Boolean(config.enabled && config.supabaseUrl && config.supabaseAnonKey && window.supabase);
}

async function initCloudSync() {
  renderCloudPanel("Checking");

  if (!isCloudConfigured()) {
    renderCloudPanel("Local only", "Cloud sync is not configured yet.");
    return;
  }

  const config = getCloudConfig();
  cloudClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data } = await cloudClient.auth.getSession();
  cloudUser = data.session?.user || null;

  cloudClient.auth.onAuthStateChange((_event, session) => {
    cloudUser = session?.user || null;
    renderCloudPanel();
    if (cloudUser) pullCloudState(true);
  });

  renderCloudPanel();
  if (cloudUser) await pullCloudState(true);
}

function renderCloudPanel(statusText, messageText) {
  if (!els.cloudStatus) return;

  const configured = isCloudConfigured();
  const signedIn = Boolean(cloudUser);
  els.cloudStatus.textContent = statusText || (signedIn ? "Synced" : configured ? "Ready" : "Local");
  els.cloudEmail.disabled = !configured || signedIn;
  els.cloudSignInBtn.hidden = signedIn;
  els.cloudSignInBtn.disabled = !configured;
  els.cloudSyncBtn.disabled = !configured || !signedIn;
  els.cloudSignOutBtn.hidden = !signedIn;

  if (cloudUser?.email) {
    els.cloudEmail.value = cloudUser.email;
  }

  els.cloudMessage.textContent = messageText || (
    signedIn
      ? `Signed in as ${cloudUser.email || "this user"}. Records sync automatically.`
      : configured
        ? "Enter your email to receive a Supabase login link."
        : "Cloud sync is optional. Configure Supabase to enable it."
  );
}

async function sendCloudLoginLink() {
  if (!cloudClient) return;
  const email = els.cloudEmail.value.trim();
  if (!email) {
    renderCloudPanel("Ready", "Enter an email address first.");
    return;
  }

  renderCloudPanel("Sending", "Sending login link...");
  const { error } = await cloudClient.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: window.location.href.split("#")[0]
    }
  });

  if (error) {
    renderCloudPanel("Error", error.message);
    return;
  }

  renderCloudPanel("Email sent", "Open the login link from your email, then return to this page.");
}

async function signOutCloud() {
  if (!cloudClient) return;
  await cloudClient.auth.signOut();
  cloudUser = null;
  renderCloudPanel("Signed out", "Local records remain on this browser.");
}

async function syncCloudNow() {
  if (!cloudClient || !cloudUser) return;
  renderCloudPanel("Syncing", "Merging local and cloud records...");
  await pullCloudState(true);
  await pushCloudState();
}

function queueCloudSave() {
  if (!cloudClient || !cloudUser) return;
  window.clearTimeout(cloudSaveTimer);
  cloudSaveTimer = window.setTimeout(pushCloudState, CLOUD_SAVE_DELAY);
}

async function pullCloudState(mergeLocal) {
  if (!cloudClient || !cloudUser) return;

  const { data, error } = await cloudClient
    .from(CLOUD_TABLE)
    .select("data, updated_at")
    .eq("user_id", cloudUser.id)
    .maybeSingle();

  if (error) {
    renderCloudPanel("Error", error.message);
    return;
  }

  if (!data?.data) {
    await pushCloudState();
    return;
  }

  const remoteState = normalizeCloudState(data.data);
  isApplyingCloudState = true;
  state = mergeLocal ? mergeStates(state, remoteState) : remoteState;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  isApplyingCloudState = false;
  selectedIds.clear();
  renderAll();
  renderCloudPanel("Synced", `Last cloud update: ${formatDate(data.updated_at)}.`);
}

async function pushCloudState() {
  if (!cloudClient || !cloudUser) return;

  const { error } = await cloudClient
    .from(CLOUD_TABLE)
    .upsert({
      user_id: cloudUser.id,
      data: state,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

  if (error) {
    renderCloudPanel("Error", error.message);
    return;
  }

  renderCloudPanel("Synced", `Synced at ${formatDate(new Date().toISOString())}.`);
}

function normalizeCloudState(value) {
  if (!value || !Array.isArray(value.entries)) return loadState();
  return {
    groups: normalizeGroups(value.groups),
    entries: migrateEntries(value.entries),
    settings: {
      openCardOnLaunch: true,
      lastGroupId: "algorithm",
      ...(value.settings || {})
    }
  };
}

function mergeStates(localState, remoteState) {
  const groupsById = new Map();
  normalizeGroups(remoteState.groups).forEach((group) => groupsById.set(group.id, group));
  normalizeGroups(localState.groups).forEach((group) => groupsById.set(group.id, group));

  const entriesById = new Map();
  migrateEntries(remoteState.entries).forEach((entry) => entriesById.set(entry.id, entry));
  migrateEntries(localState.entries).forEach((entry) => {
    const existing = entriesById.get(entry.id);
    if (!existing || getEntryTimestamp(entry) >= getEntryTimestamp(existing)) {
      entriesById.set(entry.id, entry);
    }
  });

  return {
    groups: [...groupsById.values()],
    entries: [...entriesById.values()].sort((a, b) => getEntryTimestamp(b) - getEntryTimestamp(a)),
    settings: {
      ...(remoteState.settings || {}),
      ...(localState.settings || {})
    }
  };
}

function getEntryTimestamp(entry) {
  return new Date(entry.updatedAt || entry.createdAt || 0).getTime();
}

function renderAll() {
  els.launchToggle.checked = Boolean(state.settings.openCardOnLaunch);
  renderNewGroupPreset();
  renderGroupFilters();
  renderProjectFilters();
  renderProjectQuickSelect();
  renderGroupSelect();
  renderEntries();
  renderSelectionInfo();
}

function renderNewGroupPreset() {
  els.newGroupPreset.innerHTML = renderColorPresetOptions(els.newGroupColor.value || COLOR_PRESETS[5].value);
  if (!els.newGroupColor.value) els.newGroupColor.value = COLOR_PRESETS[5].value;
}

function renderGroupFilters() {
  const counts = getGroupCounts();
  const allCount = state.entries.length;
  const buttons = [
    `<button class="group-filter ${activeGroup === "all" ? "active" : ""}" type="button" data-group="all">
      <span class="group-main"><span class="group-cn">全部</span><span class="group-en">All Entries</span></span>
      <span class="count-pill">${allCount}</span>
    </button>`
  ];

  state.groups.forEach((group) => {
    const groupColor = normalizeColor(group.color);
    buttons.push(`
      <button class="group-filter ${activeGroup === group.id ? "active" : ""}" type="button" data-group="${escapeHtml(group.id)}" style="--group-color: ${escapeAttribute(groupColor)}">
        <span class="group-main">
          <span class="group-cn">${escapeHtml(group.label)}</span>
          <span class="group-en">${escapeHtml(group.exportName)}</span>
        </span>
        <span class="count-pill">${counts[group.id] || 0}</span>
      </button>
    `);
  });

  els.groupFilters.innerHTML = buttons.join("");
  els.groupFilters.querySelectorAll(".group-filter").forEach((button) => {
    button.addEventListener("click", () => {
      activeGroup = button.dataset.group;
      renderGroupFilters();
      renderEntries();
    });
  });
}

function renderGroupSelect() {
  els.entryGroup.innerHTML = state.groups
    .map((group) => `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)} · ${escapeHtml(group.exportName)}</option>`)
    .join("");
}

function renderProjectQuickSelect() {
  const projects = getProjectNames();
  els.entryProjectQuick.innerHTML = [
    `<option value="">Existing project</option>`,
    ...projects.map((project) => `<option value="${escapeAttribute(project)}">${escapeHtml(project)}</option>`)
  ].join("");
}

function renderColorPresetOptions(selectedColor = "") {
  const normalizedSelected = normalizeColor(selectedColor, "").toLowerCase();
  return [
    `<option value="">Preset</option>`,
    ...COLOR_PRESETS.map((preset) => {
      const selected = preset.value.toLowerCase() === normalizedSelected ? "selected" : "";
      return `<option value="${escapeAttribute(preset.value)}" ${selected}>${escapeHtml(preset.name)}</option>`;
    })
  ].join("");
}

function renderProjectFilters() {
  const counts = getProjectCounts();
  const projects = Object.keys(counts).sort((a, b) => {
    if (a === NO_PROJECT) return 1;
    if (b === NO_PROJECT) return -1;
    return a.localeCompare(b);
  });
  if (activeProject !== "all" && !counts[activeProject]) activeProject = "all";
  els.projectCount.textContent = String(projects.filter((project) => project !== NO_PROJECT).length);

  const buttons = [
    `<button class="group-filter project-filter ${activeProject === "all" ? "active" : ""}" type="button" data-project="all">
      <span class="group-main"><span class="group-cn">全部项目</span><span class="group-en">All Projects</span></span>
      <span class="count-pill">${state.entries.length}</span>
    </button>`
  ];

  projects.forEach((project) => {
    const label = project === NO_PROJECT ? "No Project" : project;
    buttons.push(`
      <button class="group-filter project-filter ${activeProject === project ? "active" : ""}" type="button" data-project="${escapeAttribute(encodeURIComponent(project))}">
        <span class="group-main">
          <span class="group-cn">${escapeHtml(label)}</span>
          <span class="group-en">Project</span>
        </span>
        <span class="count-pill">${counts[project] || 0}</span>
      </button>
    `);
  });

  els.projectFilters.innerHTML = buttons.join("");
  els.projectFilters.querySelectorAll(".project-filter").forEach((button) => {
    button.addEventListener("click", () => {
      activeProject = button.dataset.project === "all" ? "all" : decodeURIComponent(button.dataset.project);
      renderProjectFilters();
      renderEntries();
    });
  });
}

function renderEntries() {
  const entries = getVisibleEntries();
  const total = entries.length;
  const groupName = activeGroup === "all" ? "All Entries" : getGroupName(activeGroup, "exportName");
  const projectName = activeProject === "all" ? "All Projects" : getProjectLabel(activeProject);
  els.activeContext.textContent = `${groupName} · ${projectName} · ${total} visible · ${selectedIds.size} selected`;

  if (entries.length === 0) {
    els.entryList.innerHTML = `
      <div class="empty-state">
        <strong>No entries yet.</strong>
        <p>Click New Entry to start a Problem / Cause / Solution / Takeaway card.</p>
      </div>
    `;
    renderSelectionInfo();
    return;
  }

  els.entryList.innerHTML = entries.map((entry) => renderEntryCard(entry)).join("");

  els.entryList.querySelectorAll("[data-action='edit']").forEach((button) => {
    button.addEventListener("click", () => openEntryModal(getEntry(button.dataset.id)));
  });

  els.entryList.querySelectorAll("[data-action='duplicate']").forEach((button) => {
    button.addEventListener("click", () => duplicateEntry(button.dataset.id));
  });

  els.entryList.querySelectorAll(".entry-check").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) selectedIds.add(checkbox.value);
      else selectedIds.delete(checkbox.value);
      renderSelectionInfo();
      els.activeContext.textContent = `${groupName} · ${projectName} · ${total} visible · ${selectedIds.size} selected`;
    });
  });

  renderSelectionInfo();
}

function renderEntryCard(entry) {
  const group = getGroup(entry.groupId);
  const problem = entry.problem || "(No problem written yet)";
  const cause = entry.cause || "";
  const solution = entry.solution || "";
  const takeaway = entry.takeaway || "";
  const project = getEntryProject(entry);
  const timeSpent = getEntryTime(entry);
  const updated = formatDate(entry.updatedAt || entry.createdAt);
  const checked = selectedIds.has(entry.id) ? "checked" : "";
  const groupColor = normalizeColor(group.color);

  return `
    <article class="entry-card" style="--group-color: ${escapeAttribute(groupColor)}">
      <input class="entry-check" type="checkbox" value="${escapeHtml(entry.id)}" ${checked} aria-label="Select entry" />
      <div class="entry-main">
        <div class="entry-title-row">
          <h3>${escapeHtml(project || "No Project")}</h3>
          <span class="tag group-tag">${escapeHtml(group.exportName)}</span>
        </div>
        <div class="entry-preview">
          <div><strong>Problem:</strong> ${escapeHtml(truncate(problem, 150))}</div>
          ${cause ? `<div><strong>Cause:</strong> ${escapeHtml(truncate(cause, 120))}</div>` : ""}
          ${solution ? `<div><strong>Solution:</strong> ${escapeHtml(truncate(solution, 120))}</div>` : ""}
          ${takeaway ? `<div><strong>Takeaway:</strong> ${escapeHtml(truncate(takeaway, 120))}</div>` : ""}
        </div>
        <div class="entry-meta">
          <span>Updated ${escapeHtml(updated)}</span>
          ${timeSpent ? `<span class="tag time-tag">Time ${escapeHtml(timeSpent)}</span>` : ""}
        </div>
      </div>
      <div class="entry-actions">
        <button class="button compact" type="button" data-action="edit" data-id="${escapeHtml(entry.id)}">Edit</button>
        <button class="button compact" type="button" data-action="duplicate" data-id="${escapeHtml(entry.id)}">Copy</button>
      </div>
    </article>
  `;
}

function getVisibleEntries() {
  const query = els.searchInput.value.trim().toLowerCase();
  let entries = [...state.entries];

  if (activeGroup !== "all") entries = entries.filter((entry) => entry.groupId === activeGroup);
  if (activeProject !== "all") entries = entries.filter((entry) => getProjectKey(entry) === activeProject);
  if (query) {
    entries = entries.filter((entry) => {
      const text = [
        entry.project, entry.title, entry.problem, entry.cause, entry.solution,
        entry.takeaway, entry.timeSpent, getGroupName(entry.groupId, "exportName"),
        getGroupName(entry.groupId, "label")
      ].join(" ").toLowerCase();
      return text.includes(query);
    });
  }

  const sortBy = els.sortSelect.value;
  entries.sort((a, b) => {
    if (sortBy === "createdAsc") return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortBy === "createdDesc") return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === "group") {
      const groupDiff = getGroupName(a.groupId, "exportName").localeCompare(getGroupName(b.groupId, "exportName"));
      return groupDiff || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    }
    if (sortBy === "project") {
      const projectDiff = getEntryProject(a).localeCompare(getEntryProject(b));
      return projectDiff || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
    }
    if (sortBy === "timeAsc") return compareTimeSpent(a, b, "asc");
    if (sortBy === "timeDesc") return compareTimeSpent(a, b, "desc");
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });

  return entries;
}

function openEntryModal(entry = null, preferredGroupId = "algorithm") {
  const isEdit = Boolean(entry);
  els.entryModalTitle.textContent = isEdit ? "Edit Entry" : "New Entry";
  els.entryId.value = entry?.id || "";
  els.entryProject.value = entry?.project || entry?.title || "";
  els.entryProjectQuick.value = "";
  els.entryGroup.value = entry?.groupId || preferredGroupId || "algorithm";
  els.entryTime.value = entry?.timeSpent || "";
  els.entryProblem.value = entry?.problem || "";
  els.entryCause.value = entry?.cause || "";
  els.entrySolution.value = entry?.solution || "";
  els.entryTakeaway.value = entry?.takeaway || "";
  els.deleteEntryBtn.hidden = !isEdit;
  els.entryModal.hidden = false;
  window.setTimeout(() => els.entryProblem.focus(), 60);
}

function closeEntryModal() {
  els.entryModal.hidden = true;
}

function saveEntryFromForm(event) {
  event.preventDefault();

  const now = new Date().toISOString();
  const id = els.entryId.value || makeId("entry");
  const existing = getEntry(id);
  const entry = {
    id,
    project: els.entryProject.value.trim(),
    groupId: els.entryGroup.value,
    timeSpent: els.entryTime.value.trim(),
    problem: els.entryProblem.value.trim(),
    cause: els.entryCause.value.trim(),
    solution: els.entrySolution.value.trim(),
    takeaway: els.entryTakeaway.value.trim(),
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  if (existing) {
    state.entries = state.entries.map((item) => (item.id === id ? entry : item));
  } else {
    state.entries.unshift(entry);
  }

  state.settings.lastGroupId = entry.groupId;
  saveState();
  closeEntryModal();
  renderAll();
}

function deleteCurrentEntry() {
  const id = els.entryId.value;
  if (!id) return;
  const entry = getEntry(id);
  if (!entry) return;
  if (!confirm(`Delete "${getEntryProject(entry) || "this entry"}"?`)) return;
  state.entries = state.entries.filter((item) => item.id !== id);
  selectedIds.delete(id);
  saveState();
  closeEntryModal();
  renderAll();
}

function duplicateEntry(id) {
  const entry = getEntry(id);
  if (!entry) return;
  const now = new Date().toISOString();
  const copy = {
    ...entry,
    id: makeId("entry"),
    createdAt: now,
    updatedAt: now
  };
  state.entries.unshift(copy);
  saveState();
  renderAll();
}

function openGroupModal() {
  renderGroupEditor();
  els.groupModal.hidden = false;
}

function closeGroupModal() {
  els.groupModal.hidden = true;
}

function renderGroupEditor() {
  els.groupEditorList.innerHTML = state.groups.map((group) => `
    <div class="group-editor-row" data-id="${escapeHtml(group.id)}">
      <input type="text" data-field="label" value="${escapeAttribute(group.label)}" aria-label="Chinese group label" />
      <input type="text" data-field="exportName" value="${escapeAttribute(group.exportName)}" aria-label="English export heading" />
      <input type="color" data-field="color" value="${escapeAttribute(normalizeColor(group.color))}" aria-label="Group color" />
      <select data-field="preset" aria-label="Color preset">${renderColorPresetOptions(group.color)}</select>
      <button class="button danger" type="button" data-action="deleteGroup" ${group.locked ? "disabled" : ""}>Delete</button>
    </div>
  `).join("");

  els.groupEditorList.querySelectorAll("[data-field='preset']").forEach((select) => {
    select.addEventListener("change", () => {
      if (!select.value) return;
      const row = select.closest(".group-editor-row");
      row.querySelector("[data-field='color']").value = select.value;
    });
  });

  els.groupEditorList.querySelectorAll("[data-action='deleteGroup']").forEach((button) => {
    button.addEventListener("click", () => {
      const row = button.closest(".group-editor-row");
      row.remove();
    });
  });
}

function addGroup(event) {
  event.preventDefault();
  const label = els.newGroupLabel.value.trim();
  const exportName = els.newGroupExport.value.trim();
  const color = normalizeColor(els.newGroupColor.value);
  if (!label || !exportName) return;

  const group = {
    id: makeId("group"),
    label,
    exportName,
    color,
    locked: false
  };

  state.groups.push(group);
  els.newGroupLabel.value = "";
  els.newGroupExport.value = "";
  els.newGroupColor.value = COLOR_PRESETS[5].value;
  els.newGroupPreset.value = COLOR_PRESETS[5].value;
  renderGroupEditor();
}

function saveGroupChanges() {
  const rows = [...els.groupEditorList.querySelectorAll(".group-editor-row")];
  const previousIds = new Set(state.groups.map((group) => group.id));
  const nextGroups = rows.map((row) => {
    const id = row.dataset.id;
    const previous = state.groups.find((group) => group.id === id);
    return {
      id,
      label: row.querySelector("[data-field='label']").value.trim() || previous?.label || "自定义",
      exportName: row.querySelector("[data-field='exportName']").value.trim() || previous?.exportName || "Custom",
      color: normalizeColor(row.querySelector("[data-field='color']").value, previous?.color || "#eceaf2"),
      locked: Boolean(previous?.locked)
    };
  });

  const nextIds = new Set(nextGroups.map((group) => group.id));
  const fallbackId = nextGroups[0]?.id || "custom";
  state.entries = state.entries.map((entry) => previousIds.has(entry.groupId) && !nextIds.has(entry.groupId)
    ? { ...entry, groupId: fallbackId, updatedAt: new Date().toISOString() }
    : entry);
  state.groups = nextGroups.length ? nextGroups : structuredClone(DEFAULT_GROUPS);
  if (!state.groups.some((group) => group.id === activeGroup)) activeGroup = "all";
  if (!state.groups.some((group) => group.id === state.settings.lastGroupId)) {
    state.settings.lastGroupId = state.groups[0]?.id || "algorithm";
  }

  saveState();
  closeGroupModal();
  renderAll();
}

function resetGroups() {
  if (!confirm("Reset group names to the default list? Existing entries will keep matching default groups when possible.")) return;
  state.groups = structuredClone(DEFAULT_GROUPS);
  state.entries = state.entries.map((entry) => {
    const exists = state.groups.some((group) => group.id === entry.groupId);
    return exists ? entry : { ...entry, groupId: "custom", updatedAt: new Date().toISOString() };
  });
  activeGroup = "all";
  saveState();
  renderGroupEditor();
  renderAll();
}

function selectVisibleEntries() {
  getVisibleEntries().forEach((entry) => selectedIds.add(entry.id));
  renderEntries();
  renderSelectionInfo();
}

function renderSelectionInfo() {
  const targetCount = getTargetEntries().length;
  els.selectionInfo.textContent = selectedIds.size ? `${selectedIds.size} selected` : `${targetCount} visible`;
}

function getTargetEntries() {
  if (selectedIds.size > 0) {
    const selected = state.entries.filter((entry) => selectedIds.has(entry.id));
    return sortForExport(selected);
  }
  return sortForExport(getVisibleEntries());
}

function sortForExport(entries) {
  return [...entries].sort((a, b) => {
    const groupDiff = getGroupOrder(a.groupId) - getGroupOrder(b.groupId);
    if (groupDiff !== 0) return groupDiff;
    return new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function exportTxt() {
  const entries = getTargetEntries();
  if (!entries.length) {
    alert("No entries to export.");
    return;
  }

  downloadFile(
    makeExportText(entries),
    `experience-reflections-${dateStamp()}.txt`,
    "text/plain;charset=utf-8"
  );
}

function exportPdf() {
  const entries = getTargetEntries();
  if (!entries.length) {
    alert("No entries to export.");
    return;
  }

  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=920,height=760");
  if (!printWindow) {
    alert("The PDF preview window was blocked. Please allow pop-ups for this local app.");
    return;
  }

  const grouped = groupEntries(entries);
  const body = grouped.map(({ group, items }) => `
    <section>
      <h2>${escapeHtml(group.exportName)}</h2>
      ${items.map((entry, index) => `
        <article>
          <h3>${index + 1}. ${escapeHtml(getEntryProject(entry) || "No Project")}</h3>
          ${printLine("Project", getEntryProject(entry))}
          ${printLine("Problem", entry.problem)}
          ${printLine("Cause", entry.cause)}
          ${printLine("Solution", entry.solution)}
          ${printLine("Takeaway", entry.takeaway)}
          ${getEntryTime(entry) ? `<p class="meta"><strong>Time:</strong> ${escapeHtml(getEntryTime(entry))}</p>` : ""}
        </article>
      `).join("")}
    </section>
  `).join("");

  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Experience Reflections</title>
        <style>
          body { font-family: "Segoe UI", Arial, sans-serif; color: #202522; margin: 34px; line-height: 1.55; }
          h1 { font-size: 24px; margin: 0 0 20px; }
          h2 { font-size: 18px; margin: 24px 0 10px; border-bottom: 1px solid #d8ded8; padding-bottom: 6px; }
          h3 { font-size: 15px; margin: 14px 0 8px; }
          article { break-inside: avoid; margin-bottom: 14px; }
          p { margin: 5px 0; white-space: pre-wrap; }
          .meta { color: #66716b; }
          @page { margin: 18mm; }
        </style>
      </head>
      <body>
        <h1>A Summary of Experience and Reflections</h1>
        ${body}
        <script>
          window.addEventListener("load", () => {
            window.focus();
            window.print();
          });
        <\/script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

function makeExportText(entries) {
  const lines = ["## A Summary of Experience and Reflections", ""];
  groupEntries(entries).forEach(({ group, items }) => {
    lines.push(`### ${group.exportName}`, "");
    items.forEach((entry, index) => {
      const project = getEntryProject(entry) || "No Project";
      lines.push(`${index + 1}. ${project}`);
      lines.push(formatExportField("Project", project));
      lines.push(formatExportField("Problem", entry.problem));
      lines.push(formatExportField("Cause", entry.cause));
      lines.push(formatExportField("Solution", entry.solution));
      lines.push(formatExportField("Takeaway", entry.takeaway));
      if (getEntryTime(entry)) lines.push(`- Time: ${getEntryTime(entry)}`);
      lines.push("");
    });
  });
  return lines.join("\n");
}

function formatExportField(label, value) {
  const clean = value?.trim() || "";
  if (!clean) return `- ${label}:`;
  return `- ${label}: ${clean.replace(/\n/g, "\n  ")}`;
}

function printLine(label, value) {
  const clean = value?.trim() || "";
  return `<p><strong>${label}:</strong> ${escapeHtml(clean)}</p>`;
}

function backupJson() {
  downloadFile(
    JSON.stringify(state, null, 2),
    `experience-reflections-backup-${dateStamp()}.json`,
    "application/json;charset=utf-8"
  );
}

function importJson(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(reader.result);
      if (!imported || !Array.isArray(imported.entries)) throw new Error("Invalid backup");
      if (!confirm("Import this backup and replace current local data?")) return;
      state = {
        groups: normalizeGroups(imported.groups),
        entries: Array.isArray(imported.entries) ? migrateEntries(imported.entries) : [],
        settings: {
          openCardOnLaunch: true,
          lastGroupId: "algorithm",
          ...(imported.settings || {})
        }
      };
      selectedIds.clear();
      activeGroup = "all";
      activeProject = "all";
      saveState();
      renderAll();
    } catch {
      alert("This JSON file does not look like a valid backup.");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function generateSmartSummary() {
  const entries = getTargetEntries();
  if (!entries.length) {
    els.summaryOutput.value = "No entries are available for summary.";
    return;
  }

  const grouped = groupEntries(entries);
  const topGroups = grouped
    .map(({ group, items }) => `${group.exportName} (${items.length})`)
    .join(", ");
  const projects = [...new Set(entries.map((entry) => getEntryProject(entry)).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const projectText = projects.length ? ` across ${projects.length} project${projects.length > 1 ? "s" : ""}: ${projects.slice(0, 5).join(", ")}` : "";
  const keywords = getTopKeywords(entries).slice(0, 8);
  const missingSolutions = entries.filter((entry) => !entry.solution?.trim()).length;
  const missingTakeaways = entries.filter((entry) => !entry.takeaway?.trim()).length;

  const groupLines = grouped.map(({ group, items }) => {
    const takeaway = firstMeaningful(items.map((entry) => entry.takeaway));
    return `- ${group.exportName}: ${items.length} record${items.length > 1 ? "s" : ""}${takeaway ? `. Key lesson: ${takeaway}` : "."}`;
  });

  const nextSteps = [];
  if (missingSolutions) nextSteps.push(`${missingSolutions} record${missingSolutions > 1 ? "s" : ""} still need clearer solutions`);
  if (missingTakeaways) nextSteps.push(`${missingTakeaways} record${missingTakeaways > 1 ? "s" : ""} still need stronger takeaways`);

  els.summaryOutput.value = [
    `This reflection includes ${entries.length} record${entries.length > 1 ? "s" : ""}${projectText}, mainly covering ${topGroups}.`,
    keywords.length ? `The repeated themes are ${keywords.join(", ")}.` : "The entries focus on practical project problems and lessons.",
    "",
    ...groupLines,
    "",
    nextSteps.length
      ? `Next, I should focus on ${nextSteps.join(", ")}.`
      : "Overall, the notes show a clear pattern: define the problem, find the cause, test the solution, and turn the result into a practical lesson."
  ].join("\n");
}

async function copySummary() {
  const text = els.summaryOutput.value.trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    els.copySummaryBtn.textContent = "Copied";
    window.setTimeout(() => {
      els.copySummaryBtn.textContent = "Copy Summary";
    }, 1000);
  } catch {
    els.summaryOutput.select();
    document.execCommand("copy");
  }
}

function getTopKeywords(entries) {
  const words = entries
    .flatMap((entry) => [
      entry.project, entry.title, entry.problem, entry.cause, entry.solution,
      entry.takeaway, entry.timeSpent
    ])
    .join(" ")
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g) || [];

  const counts = new Map();
  words.forEach((word) => {
    if (STOP_WORDS.has(word)) return;
    counts.set(word, (counts.get(word) || 0) + 1);
  });

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);
}

function firstMeaningful(values) {
  const value = values.find((item) => item && item.trim().length > 12);
  return value ? truncate(value.trim(), 150) : "";
}

function getGroupCounts() {
  return state.entries.reduce((counts, entry) => {
    counts[entry.groupId] = (counts[entry.groupId] || 0) + 1;
    return counts;
  }, {});
}

function getProjectCounts() {
  return state.entries.reduce((counts, entry) => {
    const key = getProjectKey(entry);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function getProjectKey(entry) {
  const project = getEntryProject(entry);
  return project || NO_PROJECT;
}

function getProjectLabel(projectKey) {
  return projectKey === NO_PROJECT ? "No Project" : projectKey;
}

function getProjectNames() {
  return [...new Set(state.entries.map((entry) => getEntryProject(entry)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function getEntryProject(entry) {
  return (entry.project || entry.title || "").trim();
}

function getEntryTime(entry) {
  return (entry.timeSpent || "").trim();
}

function compareTimeSpent(a, b, direction) {
  const aMinutes = parseTimeToMinutes(getEntryTime(a));
  const bMinutes = parseTimeToMinutes(getEntryTime(b));
  if (aMinutes == null && bMinutes == null) {
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  }
  if (aMinutes == null) return 1;
  if (bMinutes == null) return -1;
  const diff = direction === "desc" ? bMinutes - aMinutes : aMinutes - bMinutes;
  return diff || new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
}

function parseTimeToMinutes(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return null;

  let total = 0;
  let matched = false;
  const pattern = /(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)?/g;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2] || "m";
    total += unit.startsWith("h") ? amount * 60 : amount;
  }
  return matched ? total : null;
}

function groupEntries(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const group = getGroup(entry.groupId);
    if (!groups.has(group.id)) groups.set(group.id, { group, items: [] });
    groups.get(group.id).items.push(entry);
  });

  return [...groups.values()].sort((a, b) => getGroupOrder(a.group.id) - getGroupOrder(b.group.id));
}

function getGroup(groupId) {
  return state.groups.find((group) => group.id === groupId) || state.groups[0] || DEFAULT_GROUPS[0];
}

function getGroupName(groupId, field) {
  return getGroup(groupId)?.[field] || "";
}

function getGroupOrder(groupId) {
  const index = state.groups.findIndex((group) => group.id === groupId);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getEntry(id) {
  return state.entries.find((entry) => entry.id === id);
}

function normalizeColor(value, fallback = "#eceaf2") {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : fallback;
}

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || "";
  return `${text.slice(0, maxLength - 1)}…`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function makeId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
