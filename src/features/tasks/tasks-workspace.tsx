"use client";

import { Check, ChevronDown, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import WorkspaceShell from "../workspace/workspace-shell";
import "./tasks-workspace.css";

type TaskPriority = "high" | "medium" | "low";
type TaskView = "all" | "open" | "overdue" | "completed";
type TaskSort = "due-date" | "priority";

type Task = {
  id: string;
  title: string;
  matter: string;
  priority: TaskPriority;
  dueDate: string;
  completed: boolean;
};

const priorityOrder: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const priorityLabels: Record<TaskPriority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

const taskViews: { id: TaskView; label: string }[] = [
  { id: "all", label: "All tasks" },
  { id: "open", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "completed", label: "Completed" },
];

function isTaskPriority(value: string): value is TaskPriority {
  return value === "high" || value === "medium" || value === "low";
}

function isTaskSort(value: string): value is TaskSort {
  return value === "due-date" || value === "priority";
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function createSampleTasks(today: Date): Task[] {
  const relativeDate = (offset: number) => {
    const dueDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    return dateToInputValue(dueDate);
  };

  return [
    {
      id: "sample-01",
      title: "File position paper draft",
      matter: "Client Case #0847 · OFW dismissal",
      priority: "high",
      dueDate: relativeDate(-1),
      completed: false,
    },
    {
      id: "sample-02",
      title: "Confirm mediation availability",
      matter: "Fintrex Development Corp.",
      priority: "medium",
      dueDate: relativeDate(0),
      completed: false,
    },
    {
      id: "sample-03",
      title: "Review evidence timeline",
      matter: "Client Case #0147 · Evidence review",
      priority: "high",
      dueDate: relativeDate(2),
      completed: false,
    },
    {
      id: "sample-04",
      title: "Prepare consultation questions",
      matter: "Client Case #0839 · Employment concern",
      priority: "medium",
      dueDate: relativeDate(3),
      completed: false,
    },
    {
      id: "sample-05",
      title: "Request employment contract copy",
      matter: "Client Case #0847 · OFW dismissal",
      priority: "medium",
      dueDate: relativeDate(5),
      completed: false,
    },
    {
      id: "sample-06",
      title: "Organize client payslips",
      matter: "Client Case #0847 · OFW dismissal",
      priority: "low",
      dueDate: relativeDate(8),
      completed: false,
    },
    {
      id: "sample-07",
      title: "Upload initial intake notes",
      matter: "Client Case #0147 · Evidence review",
      priority: "low",
      dueDate: relativeDate(-1),
      completed: true,
    },
  ];
}

function getDayOffset(dateString: string, today: Date) {
  const dueDate = localDate(dateString);
  const dueUtc = Date.UTC(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((dueUtc - todayUtc) / 86_400_000);
}

function formatDueDate(dateString: string, today: Date) {
  const offset = getDayOffset(dateString, today);
  if (offset < 0) return `${Math.abs(offset)} ${Math.abs(offset) === 1 ? "day" : "days"} overdue`;
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";

  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric" }).format(localDate(dateString));
}

export default function TasksWorkspace() {
  const [today] = useState(() => new Date());
  const [tasks, setTasks] = useState(() => createSampleTasks(today));
  const [search, setSearch] = useState("");
  const [activeView, setActiveView] = useState<TaskView>("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");
  const [sortBy, setSortBy] = useState<TaskSort>("due-date");
  const [isCreating, setIsCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftMatter, setDraftMatter] = useState("");
  const [draftPriority, setDraftPriority] = useState<TaskPriority>("medium");
  const [draftDueDate, setDraftDueDate] = useState(() => dateToInputValue(today));
  const [announcement, setAnnouncement] = useState("");
  const [toast, setToast] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);
  const nextTaskId = useRef(0);

  useEffect(() => {
    if (isCreating) titleInputRef.current?.focus();
  }, [isCreating]);

  const counts = useMemo(() => {
    const openTasks = tasks.filter((task) => !task.completed);
    return {
      all: tasks.length,
      open: openTasks.length,
      overdue: openTasks.filter((task) => getDayOffset(task.dueDate, today) < 0).length,
      completed: tasks.length - openTasks.length,
    };
  }, [tasks, today]);

  const visibleTasks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tasks
      .filter((task) => {
        if (activeView === "open" && task.completed) return false;
        if (activeView === "overdue" && (task.completed || getDayOffset(task.dueDate, today) >= 0)) return false;
        if (activeView === "completed" && !task.completed) return false;
        if (priorityFilter !== "all" && task.priority !== priorityFilter) return false;
        return !query || `${task.title} ${task.matter} ${priorityLabels[task.priority]}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (sortBy === "priority" && priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        return a.dueDate.localeCompare(b.dueDate) || priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }, [activeView, priorityFilter, search, sortBy, tasks, today]);

  const toggleTask = (task: Task) => {
    const completed = !task.completed;
    setTasks((current) => current.map((item) => item.id === task.id ? { ...item, completed } : item));
    setAnnouncement(`${task.title} marked ${completed ? "complete" : "open"}.`);
  };

  const deleteTask = (task: Task) => {
    setTasks((current) => current.filter((item) => item.id !== task.id));
    setAnnouncement(`${task.title} deleted.`);
  };

  const resetDraft = () => {
    setDraftTitle("");
    setDraftMatter("");
    setDraftPriority("medium");
    setDraftDueDate(dateToInputValue(today));
  };

  const addTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const title = draftTitle.trim();
    if (!title || !draftDueDate) return;

    const task: Task = {
      id: `local-${Date.now()}-${nextTaskId.current++}`,
      title,
      matter: draftMatter.trim(),
      priority: draftPriority,
      dueDate: draftDueDate,
      completed: false,
    };
    setTasks((current) => [...current, task]);
    setActiveView("open");
    setPriorityFilter("all");
    setSearch("");
    setSortBy("due-date");
    setIsCreating(false);
    resetDraft();
    setAnnouncement(`${title} added to tasks.`);
  };

  const toggleCreateForm = () => {
    if (isCreating) {
      setIsCreating(false);
      resetDraft();
      return;
    }
    setDraftDueDate(dateToInputValue(today));
    setIsCreating(true);
  };

  const clearFilters = () => {
    setActiveView("all");
    setPriorityFilter("all");
    setSearch("");
  };

  return (
    <WorkspaceShell
      activePage="Tasks"
      search={search}
      onSearchChange={setSearch}
      onUnavailable={(label) => setToast(`${label} is not part of this demo yet.`)}
      searchPlaceholder="Search tasks and matters..."
      searchLabel="Search tasks and matters"
    >
      <main className="dashboard tasks-page">
        <div className="dashboard-heading">
          <h1>Tasks</h1>
          <button className="new-intake-button task-create-trigger" type="button" onClick={toggleCreateForm} aria-expanded={isCreating}>
            {isCreating ? <Check aria-hidden="true" size={10.05} /> : <Plus aria-hidden="true" size={10.72} />}
            {isCreating ? "Close form" : "New task"}
          </button>
        </div>

        <section className="task-ledger" aria-label="Task ledger">
          <div className="task-ledger-toolbar">
            <div className="task-view-filters" role="group" aria-label="Filter tasks by status">
              {taskViews.map(({ id, label }) => (
                <button
                  className={`task-view-filter${activeView === id ? " task-view-filter--active" : ""}`}
                  type="button"
                  key={id}
                  aria-pressed={activeView === id}
                  onClick={() => setActiveView(id)}
                >
                  {label}<span>{counts[id]}</span>
                </button>
              ))}
            </div>
            <div className="task-ledger-controls">
              <label className="task-select-wrap">
                <span className="sr-only">Filter by priority</span>
                <select
                  value={priorityFilter}
                  onChange={(event) => {
                    const value = event.target.value;
                    setPriorityFilter(value === "all" || isTaskPriority(value) ? value : "all");
                  }}
                >
                  <option value="all">Any priority</option>
                  <option value="high">High priority</option>
                  <option value="medium">Medium priority</option>
                  <option value="low">Low priority</option>
                </select>
                <ChevronDown aria-hidden="true" size={9.38} />
              </label>
              <label className="task-select-wrap task-sort-select">
                <span className="sr-only">Sort tasks</span>
                <select value={sortBy} onChange={(event) => {
                  if (isTaskSort(event.target.value)) setSortBy(event.target.value);
                }}>
                  <option value="due-date">Due date</option>
                  <option value="priority">Priority</option>
                </select>
                <ChevronDown aria-hidden="true" size={9.38} />
              </label>
            </div>
          </div>

          {isCreating && (
            <form className="task-create-form" onSubmit={addTask}>
              <label className="task-create-title">
                <span>Task</span>
                <input
                  ref={titleInputRef}
                  type="text"
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  placeholder="What needs to be done?"
                  maxLength={120}
                  required
                />
              </label>
              <label className="task-create-matter">
                <span>Matter <em>Optional</em></span>
                <input
                  type="text"
                  value={draftMatter}
                  onChange={(event) => setDraftMatter(event.target.value)}
                  placeholder="Link a case or client"
                  maxLength={100}
                />
              </label>
              <label>
                <span>Due date</span>
                <input type="date" value={draftDueDate} onChange={(event) => setDraftDueDate(event.target.value)} required />
              </label>
              <label>
                <span>Priority</span>
                <select value={draftPriority} onChange={(event) => {
                  if (isTaskPriority(event.target.value)) setDraftPriority(event.target.value);
                }}>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <div className="task-create-actions">
                <button className="task-cancel-button" type="button" onClick={toggleCreateForm}>Cancel</button>
                <button className="task-save-button" type="submit" disabled={!draftTitle.trim()}>Add task</button>
              </div>
            </form>
          )}

          <div className="task-table-heading" aria-hidden="true">
            <span className="task-heading-action">Task and matter</span>
            <span>Priority</span>
            <span>Due date</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          {visibleTasks.length > 0 ? (
            <ul className="task-list">
              {visibleTasks.map((task) => {
                const offset = getDayOffset(task.dueDate, today);
                const overdue = !task.completed && offset < 0;
                return (
                  <li className={`task-row${task.completed ? " task-row--completed" : ""}`} key={task.id}>
                    <div className="task-main">
                      <input
                        className="task-completion"
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => toggleTask(task)}
                        aria-label={`${task.completed ? "Reopen" : "Mark"} task: ${task.title}`}
                      />
                      <div className="task-description">
                        <strong>{task.title}</strong>
                        <span>{task.matter || "No matter linked"}</span>
                      </div>
                    </div>
                    <span className={`task-priority task-priority--${task.priority}`}>{priorityLabels[task.priority]}</span>
                    <time className={`task-due-date${overdue ? " task-due-date--overdue" : ""}`} dateTime={task.dueDate}>
                      {formatDueDate(task.dueDate, today)}
                    </time>
                    <span className={`task-status${task.completed ? " task-status--completed" : ""}`}>
                      {task.completed ? <><Check aria-hidden="true" size={8.71} />Complete</> : "Open"}
                    </span>
                    <button
                      className="task-delete-button"
                      type="button"
                      aria-label={`Delete task: ${task.title}`}
                      onClick={() => deleteTask(task)}
                    >
                      <Trash2 aria-hidden="true" size={10.05} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="task-empty-state" role="status">
              <span className="task-empty-mark"><RotateCcw aria-hidden="true" size={12.06} /></span>
              <h2>{search.trim() ? "No matching tasks" : "No tasks in this view"}</h2>
              <p>{search.trim() ? "Try a different search or clear the current filters." : "Change the status or priority filter to see other tasks."}</p>
              <button type="button" onClick={clearFilters}>Clear filters</button>
            </div>
          )}

          <p className="task-sample-note">Sample tasks for interface preview. Changes are temporary and stay in this browser session.</p>
        </section>
        <p className="sr-only" aria-live="polite">{announcement}</p>
      </main>
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check"><Check size={10.72} /></span>
          <span>{toast}</span>
          <button className="toast-close" type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={10.72} />
          </button>
        </div>
      )}
    </WorkspaceShell>
  );
}
