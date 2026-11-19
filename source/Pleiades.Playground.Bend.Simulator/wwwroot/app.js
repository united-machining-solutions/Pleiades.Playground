// Bend RCI Simulator - web UI (no build step, plain ES module)

const PLAN_REFRESH_INTERVAL_MS = 1000;
const MACHINE_REFRESH_INTERVAL_MS = 5000;
const MAX_LOG_ENTRIES = 1000;
const API_BASE_PATH = "/api/simulator";

const processingStateLabels = {
    Idle: "Ready",
    Running: "Running",
    Completed: "Completed",
    Cancelled: "Cancelled",
    Failed: "Failed"
};

const viewState = {
    machine: null,
    productionPackages: [],
    lastRenderedPlanJson: "",
    selectedPackageName: null,
    selectedOrderNo: null,
    processingStatus: null,
    logEntries: [],
    isRequestPending: false
};

const elements = {
    machineIdentityForm: document.getElementById("machineIdentityForm"),
    manufacturerInput: document.getElementById("manufacturerInput"),
    modelInput: document.getElementById("modelInput"),
    serialNumberInput: document.getElementById("serialNumberInput"),
    productInstanceUri: document.getElementById("productInstanceUri"),
    machineMeta: document.getElementById("machineMeta"),
    planList: document.getElementById("planList"),
    planEmpty: document.getElementById("planEmpty"),
    planCount: document.getElementById("planCount"),
    selectedPackage: document.getElementById("selectedPackage"),
    selectedPosition: document.getElementById("selectedPosition"),
    reportedByInput: document.getElementById("reportedByInput"),
    processPositionButton: document.getElementById("processPositionButton"),
    processPackageButton: document.getElementById("processPackageButton"),
    cancelProcessingButton: document.getElementById("cancelProcessingButton"),
    autoState: document.getElementById("autoState"),
    autoMessage: document.getElementById("autoMessage"),
    progressBlock: document.getElementById("progressBlock"),
    progressPosition: document.getElementById("progressPosition"),
    progressParts: document.getElementById("progressParts"),
    progressBar: document.getElementById("progressBar"),
    stateButtons: document.querySelectorAll("[data-operating-state]"),
    errorNoInput: document.getElementById("errorNoInput"),
    errorTextInput: document.getElementById("errorTextInput"),
    manualTab: document.getElementById("manualTab"),
    datasetTab: document.getElementById("datasetTab"),
    manualPanel: document.getElementById("manualPanel"),
    datasetPanel: document.getElementById("datasetPanel"),
    packageNameInput: document.getElementById("packageNameInput"),
    packageQuantityInput: document.getElementById("packageQuantityInput"),
    positionRows: document.getElementById("positionRows"),
    positionRowTemplate: document.getElementById("positionRowTemplate"),
    addPositionRowButton: document.getElementById("addPositionRowButton"),
    datasetPackageCount: document.getElementById("datasetPackageCount"),
    datasetPositionCount: document.getElementById("datasetPositionCount"),
    datasetMinimumParts: document.getElementById("datasetMinimumParts"),
    datasetMaximumParts: document.getElementById("datasetMaximumParts"),
    datasetPrefix: document.getElementById("datasetPrefix"),
    logList: document.getElementById("logList"),
    clearLogButton: document.getElementById("clearLogButton"),
    toastStack: document.getElementById("toastStack")
};

// ---------------------------------------------------------------- helpers

async function callApi(path, options = {}) {
    const response = await fetch(path, {
        headers: options.body ? { "Content-Type": "application/json" } : undefined,
        ...options
    });

    if (response.status === 204) {
        return null;
    }

    const responseBody = await response.json().catch(() => null);
    if (!response.ok) {
        const errorText = responseBody?.detail ?? responseBody?.title ?? `HTTP ${response.status}`;
        throw new Error(errorText);
    }

    return responseBody;
}

function apiPath(suffix) {
    return `${API_BASE_PATH}${suffix}`;
}

function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) {
        element.className = className;
    }
    if (textContent !== undefined && textContent !== null) {
        element.textContent = textContent;
    }
    return element;
}

function showToast(message, isError = false) {
    const toast = createElement("div", isError ? "toast error" : "toast", message);
    elements.toastStack.append(toast);
    setTimeout(() => toast.remove(), isError ? 7000 : 3500);
}

async function runAction(action, successMessage) {
    if (viewState.isRequestPending) {
        return;
    }

    viewState.isRequestPending = true;
    updateControlStates();
    try {
        const result = await action();
        showToast(successMessage ?? result?.message ?? "OK");
        return result;
    } catch (error) {
        showToast(error.message, true);
        return undefined;
    } finally {
        viewState.isRequestPending = false;
        await refreshMachineView();
    }
}

function isProcessingRunning() {
    return viewState.processingStatus?.state === "Running";
}

// ---------------------------------------------------------------- machine identity

async function loadMachine() {
    try {
        viewState.machine = await callApi(apiPath("/machine"));
    } catch (error) {
        showToast(`The machine could not be loaded: ${error.message}`, true);
        return;
    }

    renderMachineIdentity();
    renderMachineMeta();
}

// The identity is read only: it comes from the configuration, which the adapter shares.
function renderMachineIdentity() {
    const machine = viewState.machine;
    document.title = machine ? `${machine.productInstanceUri} – Bend RCI Simulator` : "Bend RCI Simulator";

    elements.manufacturerInput.value = machine?.manufacturer ?? "";
    elements.modelInput.value = machine?.model ?? "";
    elements.serialNumberInput.value = machine?.serialNumber ?? "";
    elements.productInstanceUri.textContent = machine?.productInstanceUri || "–";
}

function renderMachineMeta() {
    const machine = viewState.machine;
    elements.machineMeta.replaceChildren();
    if (!machine?.machineDirectory) {
        return;
    }

    // The source (host path or volume) is what the adapter reads; the directory is where the simulator writes.
    const transferDirectory = machine.transferDirectorySource
        ? `${machine.transferDirectorySource} → ${machine.machineDirectory}`
        : machine.machineDirectory;
    const metaItems = [
        ["Exchange folder", transferDirectory],
        ["Telegrams", `${machine.outputFile}<n>.xml`]
    ];
    for (const [label, value] of metaItems) {
        const item = createElement("div");
        const valueElement = createElement("dd", null, value);
        valueElement.title = value;
        item.append(createElement("dt", null, label), valueElement);
        elements.machineMeta.append(item);
    }
}

// ---------------------------------------------------------------- production plan

async function refreshMachineView() {
    try {
        const [productionPackages, processingStatus] = await Promise.all([
            callApi(apiPath("/production-plan")),
            callApi(apiPath("/automatic-processing"))
        ]);
        viewState.productionPackages = productionPackages;
        viewState.processingStatus = processingStatus;
    } catch (error) {
        console.warn("Refresh failed", error);
        return;
    }

    dropSelectionIfRemoved();
    renderPlan();
    renderProcessingStatus();
    updateControlStates();
}

function dropSelectionIfRemoved() {
    const selectedPackage = viewState.productionPackages.find(productionPackage => productionPackage.name === viewState.selectedPackageName);
    if (!selectedPackage) {
        viewState.selectedPackageName = null;
        viewState.selectedOrderNo = null;
        return;
    }

    if (!selectedPackage.positions.some(position => position.orderNo === viewState.selectedOrderNo)) {
        viewState.selectedOrderNo = null;
    }
}

function renderPlan() {
    const planJson = JSON.stringify([viewState.productionPackages, viewState.selectedPackageName, viewState.selectedOrderNo, isProcessingRunning()]);
    if (planJson === viewState.lastRenderedPlanJson) {
        return;
    }
    viewState.lastRenderedPlanJson = planJson;

    const packageCount = viewState.productionPackages.length;
    elements.planCount.textContent = `${packageCount} ${packageCount === 1 ? "package" : "packages"}`;
    elements.planEmpty.hidden = packageCount > 0;
    elements.planList.replaceChildren(...viewState.productionPackages.map(renderPackage));

    elements.selectedPackage.textContent = viewState.selectedPackageName ?? "–";
    elements.selectedPosition.textContent = viewState.selectedOrderNo ?? (viewState.selectedPackageName ? "all positions" : "–");
}

function renderPackage(productionPackage) {
    const isSelectedPackage = productionPackage.name === viewState.selectedPackageName;
    const packageElement = createElement("article", isSelectedPackage ? "package selected" : "package");

    const header = createElement("div", "package-header");
    header.setAttribute("role", "treeitem");
    header.tabIndex = 0;
    header.append(createElement("span", "package-name", productionPackage.name));

    const info = createElement("div", "package-info");
    info.append(createElement("span", null, `Package ${productionPackage.processedQuantity} / ${productionPackage.desiredQuantity}`));
    if (productionPackage.reportedBy) {
        info.append(createElement("span", null, `Operator: ${productionPackage.reportedBy}`));
    }

    const deleteButton = createElement("button", "icon-button", "×");
    deleteButton.type = "button";
    deleteButton.title = "Delete package (local only, no telegram)";
    deleteButton.setAttribute("aria-label", `Delete package ${productionPackage.name}`);
    deleteButton.disabled = isProcessingRunning();
    deleteButton.addEventListener("click", event => {
        event.stopPropagation();
        deleteProductionPackage(productionPackage.name);
    });
    info.append(deleteButton);
    header.append(info);

    const selectPackage = () => selectProductionPackage(productionPackage.name, null);
    header.addEventListener("click", selectPackage);
    header.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectPackage();
        }
    });

    packageElement.append(header, renderPositionTable(productionPackage));
    return packageElement;
}

function renderPositionTable(productionPackage) {
    const table = createElement("table", "position-table");
    const headRow = createElement("tr");
    for (const columnTitle of ["Order", "Part", "Status", "Progress", ""]) {
        headRow.append(createElement("th", null, columnTitle));
    }
    table.append(createElement("thead"));
    table.tHead.append(headRow);

    const body = createElement("tbody");
    for (const position of productionPackage.positions) {
        const isSelected = productionPackage.name === viewState.selectedPackageName && position.orderNo === viewState.selectedOrderNo;
        const row = createElement("tr", isSelected ? "selected" : "");
        row.tabIndex = 0;

        const processedParts = Math.max(position.processedParts, 0);
        const progressPercent = position.desiredNumberOfParts > 0
            ? Math.min(100, (processedParts / position.desiredNumberOfParts) * 100)
            : 0;

        const statusChip = createElement("span", "status-chip", position.status);
        statusChip.dataset.status = position.status;

        const miniProgress = createElement("div", "mini-progress");
        const miniProgressFill = createElement("div");
        miniProgressFill.style.width = `${progressPercent}%`;
        miniProgress.append(miniProgressFill);

        const statusCell = createElement("td");
        statusCell.append(statusChip);
        const progressCell = createElement("td");
        progressCell.append(miniProgress);

        row.append(
            createElement("td", null, position.orderNo),
            createElement("td", null, position.partNo),
            statusCell,
            progressCell,
            createElement("td", "numeric", `${position.processedParts < 0 ? "–" : position.processedParts} / ${position.desiredNumberOfParts}`)
        );

        const selectPosition = () => selectProductionPackage(productionPackage.name, position.orderNo);
        row.addEventListener("click", selectPosition);
        row.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                selectPosition();
            }
        });
        body.append(row);
    }
    table.append(body);
    return table;
}

function selectProductionPackage(packageName, orderNo) {
    viewState.selectedPackageName = packageName;
    viewState.selectedOrderNo = orderNo;
    renderPlan();
    updateControlStates();
}

function deleteProductionPackage(packageName) {
    runAction(() => callApi(apiPath(`/production-packages/${encodeURIComponent(packageName)}`), { method: "DELETE" }));
}

// ---------------------------------------------------------------- automatic processing

function renderProcessingStatus() {
    const status = viewState.processingStatus;
    const state = status?.state ?? "Idle";

    elements.autoState.dataset.state = state;
    elements.autoState.textContent = processingStateLabels[state] ?? state;
    elements.autoMessage.textContent = status?.message ?? "";
    elements.cancelProcessingButton.hidden = state !== "Running";

    const hasProgress = state !== "Idle" && status?.positionCount > 0;
    elements.progressBlock.hidden = !hasProgress;
    if (!hasProgress) {
        return;
    }

    elements.progressPosition.textContent =
        `${status.productionPackageName} · Position ${status.currentPositionNumber}/${status.positionCount} (${status.currentOrderNo ?? "–"})`;
    elements.progressParts.textContent = `Part ${status.processedParts}/${status.desiredParts}`;
    const progressPercent = status.desiredParts > 0 ? (status.processedParts / status.desiredParts) * 100 : 0;
    elements.progressBar.style.width = `${progressPercent}%`;
}

function startAutomaticProcessing(processWholePackage) {
    const request = {
        packageName: viewState.selectedPackageName,
        orderNo: processWholePackage ? null : viewState.selectedOrderNo,
        reportedBy: elements.reportedByInput.value.trim()
    };

    runAction(() => callApi(apiPath("/automatic-processing"), { method: "POST", body: JSON.stringify(request) }));
}

function cancelAutomaticProcessing() {
    runAction(() => callApi(apiPath("/automatic-processing"), { method: "DELETE" }));
}

// ---------------------------------------------------------------- MDE

function sendOperatingState(operatingState) {
    const request = {
        operatingState,
        errorNo: operatingState === "Error" ? elements.errorNoInput.value.trim() : null,
        errorText: operatingState === "Error" ? elements.errorTextInput.value.trim() : null
    };

    runAction(() => callApi(apiPath("/operating-state"), { method: "POST", body: JSON.stringify(request) }));
}

// ---------------------------------------------------------------- dummy data

function selectDataTab(showManualPanel) {
    elements.manualTab.setAttribute("aria-selected", String(showManualPanel));
    elements.datasetTab.setAttribute("aria-selected", String(!showManualPanel));
    elements.manualPanel.hidden = !showManualPanel;
    elements.datasetPanel.hidden = showManualPanel;
}

function addPositionRow() {
    const rowFragment = elements.positionRowTemplate.content.cloneNode(true);
    const row = rowFragment.querySelector(".position-row");
    const rowNumber = elements.positionRows.children.length + 1;
    const packageName = elements.packageNameInput.value.trim();
    row.querySelector("[name=orderNo]").value = packageName ? `${packageName}-${String(rowNumber).padStart(2, "0")}` : "";
    row.querySelector("button").addEventListener("click", () => {
        if (elements.positionRows.children.length > 1) {
            row.remove();
        }
    });
    elements.positionRows.append(row);
}

function resetManualForm() {
    elements.manualPanel.reset();
    elements.positionRows.replaceChildren();
    addPositionRow();
}

async function submitManualPackage(event) {
    event.preventDefault();
    const request = {
        packageName: elements.packageNameInput.value.trim(),
        desiredQuantity: Number(elements.packageQuantityInput.value),
        positions: [...elements.positionRows.querySelectorAll(".position-row")].map(row => ({
            orderNo: row.querySelector("[name=orderNo]").value.trim(),
            partNo: row.querySelector("[name=partNo]").value.trim(),
            desiredNumberOfParts: Number(row.querySelector("[name=desiredParts]").value)
        }))
    };

    const result = await runAction(() => callApi(apiPath("/production-packages"), { method: "POST", body: JSON.stringify(request) }));
    if (result) {
        selectProductionPackage(request.packageName, null);
        resetManualForm();
    }
}

function submitDatasetGeneration(event) {
    event.preventDefault();
    const request = {
        packageCount: Number(elements.datasetPackageCount.value),
        positionsPerPackage: Number(elements.datasetPositionCount.value),
        minimumPartsPerPosition: Number(elements.datasetMinimumParts.value),
        maximumPartsPerPosition: Number(elements.datasetMaximumParts.value),
        namePrefix: elements.datasetPrefix.value.trim()
    };

    runAction(() => callApi(apiPath("/production-packages/generate"), { method: "POST", body: JSON.stringify(request) }));
}

// ---------------------------------------------------------------- control states

function updateControlStates() {
    const hasMachine = Boolean(viewState.machine);
    const isBlocked = !hasMachine || isProcessingRunning() || viewState.isRequestPending;

    elements.processPositionButton.disabled = isBlocked || !viewState.selectedOrderNo;
    elements.processPackageButton.disabled = isBlocked || !viewState.selectedPackageName;
    elements.cancelProcessingButton.disabled = viewState.isRequestPending;
    elements.stateButtons.forEach(button => { button.disabled = isBlocked; });

    for (const form of [elements.manualPanel, elements.datasetPanel]) {
        form.querySelectorAll("button[type=submit]").forEach(button => { button.disabled = isBlocked; });
    }
}

// ---------------------------------------------------------------- communication log

async function loadCommunicationLog() {
    try {
        viewState.logEntries = await callApi("/api/simulator/communication-log");
    } catch (error) {
        showToast(`The log could not be loaded: ${error.message}`, true);
    }
    renderLog();
}

function connectCommunicationLogStream() {
    const eventSource = new EventSource("/api/simulator/communication-log/stream");
    eventSource.onmessage = message => {
        const entry = JSON.parse(message.data);
        viewState.logEntries.push(entry);
        if (viewState.logEntries.length > MAX_LOG_ENTRIES) {
            viewState.logEntries.splice(0, viewState.logEntries.length - MAX_LOG_ENTRIES);
        }
        appendLogEntry(entry);
    };
    // EventSource reconnects on its own; reload the snapshot so no entry is missed.
    eventSource.onopen = () => loadCommunicationLog();
}


function renderLogRow(entry) {
    const row = createElement("div", "log-row");
    const time = new Date(entry.timestamp).toLocaleTimeString();
    row.append(
        createElement("span", "muted", time),
        createElement("span", "muted channel", entry.channel),
        createElement("span", null, entry.action),
        createElement("span", "muted context", [entry.machineName, entry.context].filter(Boolean).join(" · "))
    );
    return row;
}

function isLogScrolledToBottom() {
    const logList = elements.logList;
    return logList.scrollHeight - logList.scrollTop - logList.clientHeight < 30;
}

function renderLog() {
    const visibleEntries = viewState.logEntries;
    if (visibleEntries.length === 0) {
        elements.logList.replaceChildren(createElement("div", "log-empty", "No messages sent yet."));
        return;
    }

    elements.logList.replaceChildren(...visibleEntries.map(renderLogRow));
    elements.logList.scrollTop = elements.logList.scrollHeight;
}

function appendLogEntry(entry) {
    const shouldStickToBottom = isLogScrolledToBottom();
    elements.logList.querySelector(".log-empty")?.remove();
    elements.logList.append(renderLogRow(entry));
    while (elements.logList.children.length > MAX_LOG_ENTRIES) {
        elements.logList.firstElementChild.remove();
    }
    if (shouldStickToBottom) {
        elements.logList.scrollTop = elements.logList.scrollHeight;
    }
}

async function clearCommunicationLog() {
    try {
        await callApi("/api/simulator/communication-log", { method: "DELETE" });
        viewState.logEntries = [];
        renderLog();
    } catch (error) {
        showToast(error.message, true);
    }
}

// ---------------------------------------------------------------- wiring

function registerEventHandlers() {
    // The identity is read only - nothing to submit.
    elements.machineIdentityForm.addEventListener("submit", event => event.preventDefault());
    elements.processPositionButton.addEventListener("click", () => startAutomaticProcessing(false));
    elements.processPackageButton.addEventListener("click", () => startAutomaticProcessing(true));
    elements.cancelProcessingButton.addEventListener("click", cancelAutomaticProcessing);
    elements.stateButtons.forEach(button => button.addEventListener("click", () => sendOperatingState(button.dataset.operatingState)));
    elements.manualTab.addEventListener("click", () => selectDataTab(true));
    elements.datasetTab.addEventListener("click", () => selectDataTab(false));
    elements.addPositionRowButton.addEventListener("click", addPositionRow);
    elements.manualPanel.addEventListener("submit", submitManualPackage);
    elements.datasetPanel.addEventListener("submit", submitDatasetGeneration);
    elements.clearLogButton.addEventListener("click", clearCommunicationLog);
}

async function initialize() {
    registerEventHandlers();
    resetManualForm();
    await loadMachine();
    await refreshMachineView();
    connectCommunicationLogStream();

    setInterval(refreshMachineView, PLAN_REFRESH_INTERVAL_MS);
    setInterval(loadMachine, MACHINE_REFRESH_INTERVAL_MS);
}

initialize();
