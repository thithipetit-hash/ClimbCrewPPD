const schedulerStates = new Map([
  ["backup", { name: "backup", status: "initializing", updatedAt: null }],
  ["access-log-retention", { name: "access-log-retention", status: "initializing", updatedAt: null }],
  ["security-retention", { name: "security-retention", status: "initializing", updatedAt: null }],
]);

function setSchedulerState(name, status) {
  schedulerStates.set(String(name), {
    name: String(name),
    status,
    updatedAt: new Date().toISOString(),
  });
}

export function markSchedulerHealthy(name) {
  setSchedulerState(name, "healthy");
}

export function markSchedulerDegraded(name) {
  setSchedulerState(name, "degraded");
}

export function markSchedulerDisabled(name) {
  setSchedulerState(name, "disabled");
}

export function getSchedulerHealthSnapshot() {
  const schedulers = [...schedulerStates.values()]
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  return {
    degraded: schedulers.some((scheduler) => (
      scheduler.status === "degraded" || scheduler.status === "initializing"
    )),
    schedulers,
  };
}
