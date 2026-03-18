const PRIORITY = {
  low: { value: 0, label: "Low", badge: "badge-priority-low", icon: "bx-down-arrow-circle" },
  medium: { value: 1, label: "Medium", badge: "badge-priority-medium", icon: "bx-minus-circle" },
  high: { value: 2, label: "High", badge: "badge-priority-high", icon: "bx-up-arrow-circle" },
};

const PRIORITY_KEYS = ["low", "medium", "high"];

function getPriorityKey(value) {
  return PRIORITY_KEYS[value] || "low";
}

// Abstract class for TodoItemFormatter
class TodoItemFormatter {
  formatTask(task, truncate = true) {
    return truncate && task.length > 14 ? task.slice(0, 14) + "..." : task;
  }

  formatDueDate(dueDate) {
    return dueDate || "No due date";
  }

  formatStatus(completed) {
    return completed ? "Completed" : "Pending";
  }

  formatTaskForDisplay(task) {
    return task.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
}

// Class responsible for managing Todo items
class TodoManager {
  constructor(todoItemFormatter) {
    this.todos = this.loadFromLocalStorage();
    this.todoItemFormatter = todoItemFormatter;
    this.observers = [];
    this.currentOrder = this.loadOrderFromLocalStorage();
  }

  subscribe(observer) {
    this.observers.push(observer);
  }

  notify(event, data) {
    this.observers.forEach((observer) => {
      if (observer[event]) {
        observer[event](data);
      }
    });
  }

  loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem("todos");
      const todos = stored ? JSON.parse(stored) : [];

      // Migrate old todos to support subtasks and priority
      return todos.map((todo) => ({
        ...todo,
        subtasks: todo.subtasks || [],
        priority: todo.priority || 0,
        originalTask: todo.originalTask || todo.task,
        parent: todo.parent || null,
        isExpanded: todo.isExpanded !== undefined ? todo.isExpanded : true,
        createdAt: todo.createdAt || new Date().toISOString(),
        updatedAt: todo.updatedAt || new Date().toISOString(),
      }));
    } catch (error) {
      console.error("Error loading todos from localStorage:", error);
      return [];
    }
  }

  loadOrderFromLocalStorage() {
    try {
      const order = localStorage.getItem("todoOrder");
      return order ? JSON.parse(order) : [];
    } catch (error) {
      console.error("Error loading todo order:", error);
      return [];
    }
  }

  addTodo(task, dueDate, parentId = null, priority = 0) {
    try {
      const newTodo = {
        id: this.getRandomId(),
        task: task.trim(),
        originalTask: task.trim(),
        dueDate: this.todoItemFormatter.formatDueDate(dueDate),
        completed: false,
        status: "pending",
        subtasks: [],
        priority: priority,
        parent: parentId,
        isExpanded: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      this.todos.push(newTodo);

      // If it's a subtask, add it to the parent's subtasks array
      if (parentId) {
        const parent = this.todos.find((t) => t.id === parentId);
        if (parent) {
          parent.subtasks.push(newTodo.id);
          parent.updatedAt = new Date().toISOString();
        }
      }

      this.saveToLocalStorage();
      this.notify("todoAdded", newTodo);
      return newTodo;
    } catch (error) {
      console.error("Error adding todo:", error);
      throw error;
    }
  }

  editTodo(id, updatedTask) {
    try {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        todo.task = updatedTask.trim();
        todo.originalTask = updatedTask.trim();
        todo.updatedAt = new Date().toISOString();
        this.saveToLocalStorage();
        this.notify("todoUpdated", todo);
      }
      return todo;
    } catch (error) {
      console.error("Error editing todo:", error);
      throw error;
    }
  }

  setPriority(id, priorityKey) {
    try {
      const todo = this.todos.find((t) => t.id === id);
      if (todo && PRIORITY[priorityKey] !== undefined) {
        todo.priority = PRIORITY[priorityKey].value;
        todo.updatedAt = new Date().toISOString();
        this.saveToLocalStorage();
        this.notify("todoPriorityChanged", todo);
      }
      return todo;
    } catch (error) {
      console.error("Error setting priority:", error);
      throw error;
    }
  }

  deleteTodo(id) {
    try {
      const todo = this.todos.find((t) => t.id === id);
      if (!todo) return;

      // If it's a parent, delete all subtasks first
      if (todo.subtasks && todo.subtasks.length > 0) {
        todo.subtasks.forEach((subtaskId) => {
          this.todos = this.todos.filter((t) => t.id !== subtaskId);
        });
      }

      // If it's a subtask, remove from parent's subtasks array
      if (todo.parent) {
        const parent = this.todos.find((t) => t.id === todo.parent);
        if (parent) {
          parent.subtasks = parent.subtasks.filter(
            (subtaskId) => subtaskId !== id
          );
          parent.updatedAt = new Date().toISOString();
        }
      }

      this.todos = this.todos.filter((t) => t.id !== id);
      this.currentOrder = this.currentOrder.filter((orderId) => orderId !== id);

      this.saveToLocalStorage();
      this.saveOrderToLocalStorage();
      this.notify("todoDeleted", { id, todo });
    } catch (error) {
      console.error("Error deleting todo:", error);
      throw error;
    }
  }

  toggleTodoStatus(id) {
    try {
      const todo = this.todos.find((t) => t.id === id);
      if (todo) {
        todo.completed = !todo.completed;
        todo.status = todo.completed ? "completed" : "pending";
        todo.updatedAt = new Date().toISOString();

        // If it's a parent task, update all subtasks
        if (todo.subtasks && todo.subtasks.length > 0) {
          todo.subtasks.forEach((subtaskId) => {
            const subtask = this.todos.find((t) => t.id === subtaskId);
            if (subtask) {
              subtask.completed = todo.completed;
              subtask.status = todo.completed ? "completed" : "pending";
              subtask.updatedAt = new Date().toISOString();
            }
          });
        }

        // If it's a subtask, check if all subtasks of parent are completed
        if (todo.parent) {
          const parent = this.todos.find((t) => t.id === todo.parent);
          if (parent) {
            const allSubtasksCompleted = parent.subtasks.every((subtaskId) => {
              const subtask = this.todos.find((t) => t.id === subtaskId);
              return subtask ? subtask.completed : false;
            });

            if (allSubtasksCompleted && parent.subtasks.length > 0) {
              parent.completed = true;
              parent.status = "completed";
            } else if (!todo.completed) {
              parent.completed = false;
              parent.status = "pending";
            }
            parent.updatedAt = new Date().toISOString();
          }
        }

        this.saveToLocalStorage();
        this.notify("todoStatusChanged", todo);
      }
    } catch (error) {
      console.error("Error toggling todo status:", error);
      throw error;
    }
  }

  toggleExpanded(id) {
    try {
      const todo = this.todos.find((t) => t.id === id);
      if (todo && todo.subtasks.length > 0) {
        todo.isExpanded = !todo.isExpanded;
        todo.updatedAt = new Date().toISOString();
        this.saveToLocalStorage();
        this.notify("todoExpansionChanged", todo);
      }
    } catch (error) {
      console.error("Error toggling expansion:", error);
    }
  }

  clearAllTodos() {
    try {
      if (this.todos.length > 0) {
        const deletedTodos = [...this.todos];
        this.todos = [];
        this.currentOrder = [];
        this.saveToLocalStorage();
        this.saveOrderToLocalStorage();
        this.notify("allTodosCleared", { deletedTodos });
      }
    } catch (error) {
      console.error("Error clearing all todos:", error);
      throw error;
    }
  }

  reorderTodos(newOrder) {
    try {
      this.currentOrder = newOrder;
      this.saveOrderToLocalStorage();
      this.notify("todosReordered", { newOrder });
    } catch (error) {
      console.error("Error reordering todos:", error);
    }
  }

  filterTodos(status, searchQuery = "", priorityFilter = "all") {
    try {
      let filtered;

      switch (status) {
        case "all":
          filtered = this.todos;
          break;
        case "pending":
          filtered = this.todos.filter((todo) => !todo.completed);
          break;
        case "completed":
          filtered = this.todos.filter((todo) => todo.completed);
          break;
        default:
          filtered = [];
      }

      if (priorityFilter !== "all" && PRIORITY[priorityFilter] !== undefined) {
        const priorityValue = PRIORITY[priorityFilter].value;
        filtered = filtered.filter((todo) => todo.priority === priorityValue);
      }

      // Apply search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        filtered = filtered.filter(
          (todo) =>
            todo.originalTask.toLowerCase().includes(query) ||
            todo.dueDate.toLowerCase().includes(query)
        );
      }

      return this.sortTodosByPriority(this.applySortOrder(filtered));
    } catch (error) {
      console.error("Error filtering todos:", error);
      return [];
    }
  }

  sortTodosByPriority(todos) {
    return [...todos].sort((a, b) => {
      const priorityDiff = b.priority - a.priority;
      if (priorityDiff !== 0) return priorityDiff;

      const orderIndexA = this.currentOrder.indexOf(a.id);
      const orderIndexB = this.currentOrder.indexOf(b.id);
      const safeIndexA = orderIndexA === -1 ? Number.MAX_SAFE_INTEGER : orderIndexA;
      const safeIndexB = orderIndexB === -1 ? Number.MAX_SAFE_INTEGER : orderIndexB;
      return safeIndexA - safeIndexB;
    });
  }

  applySortOrder(todos) {
    if (this.currentOrder.length === 0) {
      return todos;
    }

    const ordered = [];
    const unordered = [];

    todos.forEach((todo) => {
      const orderIndex = this.currentOrder.indexOf(todo.id);
      if (orderIndex !== -1) {
        ordered[orderIndex] = todo;
      } else {
        unordered.push(todo);
      }
    });

    return ordered.filter(Boolean).concat(unordered);
  }

  getStatistics() {
    const total = this.todos.filter((todo) => !todo.parent).length; // Only count parent todos
    const completed = this.todos.filter(
      (todo) => !todo.parent && todo.completed
    ).length;
    const pending = total - completed;
    const completionPercentage =
      total > 0 ? Math.round((completed / total) * 100) : 0;

    return {
      total,
      completed,
      pending,
      completionPercentage,
      totalIncludingSubtasks: this.todos.length,
      completedIncludingSubtasks: this.todos.filter((todo) => todo.completed)
        .length,
    };
  }

  searchTodos(query) {
    if (!query.trim()) return this.todos;

    const searchTerm = query.toLowerCase().trim();
    return this.todos.filter(
      (todo) =>
        todo.originalTask.toLowerCase().includes(searchTerm) ||
        todo.dueDate.toLowerCase().includes(searchTerm)
    );
  }

  getRandomId() {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  saveToLocalStorage() {
    try {
      localStorage.setItem("todos", JSON.stringify(this.todos));
    } catch (error) {
      console.error("Error saving to localStorage:", error);
    }
  }

  saveOrderToLocalStorage() {
    try {
      localStorage.setItem("todoOrder", JSON.stringify(this.currentOrder));
    } catch (error) {
      console.error("Error saving order to localStorage:", error);
    }
  }
}

// Class responsible for managing the UI and handling events
class UIManager {
  constructor(todoManager, todoItemFormatter) {
    this.todoManager = todoManager;
    this.todoItemFormatter = todoItemFormatter;
    this.currentFilter = "all";
    this.currentSearchQuery = "";
    this.currentPriorityFilter = "all";
    this.draggedElement = null;
    this.isEditing = false;
    this.editingId = null;

    this.initializeElements();
    this.setupEventListeners();
    this.showAllTodos();
    this.updateProgressDisplay();

    // Subscribe to TodoManager events
    this.todoManager.subscribe(this);
  }

  initializeElements() {
    this.taskInput = document.querySelector("input[type='text']");
    this.dateInput = document.querySelector(".schedule-date");
    this.prioritySelect = document.querySelector(".priority-select");
    this.addBtn = document.querySelector(".add-task-button");
    this.todosListBody = document.querySelector(".todos-list-body");
    this.alertMessage = document.querySelector(".alert-message");
    this.deleteAllBtn = document.querySelector(".delete-all-btn");
    this.searchInput = document.querySelector(".search-input");
    this.progressContainer = document.querySelector(".progress-container");
    this.confirmModal = document.querySelector(".confirm-modal");
  }

  // Observer methods
  todoAdded(todo) {
    this.updateProgressDisplay();
    this.refreshDisplay();
  }

  todoUpdated(todo) {
    this.updateProgressDisplay();
    this.refreshDisplay();
  }

  todoDeleted(data) {
    this.updateProgressDisplay();
    this.refreshDisplay();
  }

  todoStatusChanged(todo) {
    this.updateProgressDisplay();
    this.refreshDisplay();
  }

  todoPriorityChanged(todo) {
    this.updateProgressDisplay();
    this.refreshDisplay();
  }

  todoExpansionChanged(todo) {
    this.refreshDisplay();
  }

  allTodosCleared(data) {
    this.updateProgressDisplay();
    this.refreshDisplay();
  }

  todosReordered(data) {
    this.refreshDisplay();
  }

  setupEventListeners() {
    // Add todo event listeners
    this.addBtn.addEventListener("click", () => {
      this.handleAddTodo();
    });

    this.taskInput.addEventListener("keyup", (e) => {
      if (e.keyCode === 13 && this.taskInput.value.length > 0) {
        this.handleAddTodo();
      }
    });

    // Search functionality
    if (this.searchInput) {
      this.searchInput.addEventListener("input", (e) => {
        this.handleSearch(e.target.value);
      });

      // Keyboard shortcut for search
      document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.key === "f") {
          e.preventDefault();
          this.searchInput.focus();
        }
        if (e.key === "Escape" && this.searchInput === document.activeElement) {
          this.searchInput.value = "";
          this.handleSearch("");
          this.searchInput.blur();
        }
      });
    }

    // Delete all with confirmation
    this.deleteAllBtn.addEventListener("click", () => {
      this.showDeleteAllConfirmation();
    });

    // Help modal
    const helpBtn = document.querySelector(".help-btn");
    const helpModal = document.getElementById("help-modal");
    const closeHelpModal = document.querySelector(".close-help-modal");

    if (helpBtn && helpModal) {
      helpBtn.addEventListener("click", () => {
        helpModal.classList.add("modal-open");
      });
    }

    if (closeHelpModal && helpModal) {
      closeHelpModal.addEventListener("click", () => {
        helpModal.classList.remove("modal-open");
      });

      // Close modal when clicking outside
      helpModal.addEventListener("click", (e) => {
        if (e.target === helpModal) {
          helpModal.classList.remove("modal-open");
        }
      });
    }

    // Filter event listeners
    const filterButtons = document.querySelectorAll(
      ".search-filter-section .dropdown ul li a"
    );
    filterButtons.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const status = button.getAttribute("data-filter") || "all";
        this.handleFilterTodos(status);
      });
    });

    const priorityFilterBtns = document.querySelectorAll(".priority-filter-btn");
    priorityFilterBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const priorityKey = btn.getAttribute("data-priority") || "all";
        this.handlePriorityFilter(priorityKey);
      });
    });

    // Setup drag and drop
    this.setupDragAndDrop();
  }

  handlePriorityFilter(priorityKey) {
    this.currentPriorityFilter = priorityKey;
    this.refreshDisplay();

    document.querySelectorAll(".priority-filter-btn").forEach((btn) => {
      btn.classList.remove("active");
    });

    const activeBtn = document.querySelector(
      `.priority-filter-btn[data-priority="${priorityKey}"]`
    );
    if (activeBtn) {
      activeBtn.classList.add("active");
    }
  }

  setupDragAndDrop() {
    if (!this.todosListBody) return;

    this.todosListBody.addEventListener("dragstart", (e) => {
      if (e.target.closest(".todo-item")) {
        this.draggedElement = e.target.closest(".todo-item");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/html", this.draggedElement.outerHTML);
        this.draggedElement.classList.add("dragging");
      }
    });

    this.todosListBody.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";

      const afterElement = this.getDragAfterElement(e.clientY);
      if (afterElement == null) {
        this.todosListBody.appendChild(this.draggedElement);
      } else {
        this.todosListBody.insertBefore(this.draggedElement, afterElement);
      }
    });

    this.todosListBody.addEventListener("dragend", (e) => {
      if (this.draggedElement) {
        this.draggedElement.classList.remove("dragging");
        this.updateTodoOrder();
        this.draggedElement = null;
      }
    });
  }

  getDragAfterElement(y) {
    const draggableElements = [
      ...this.todosListBody.querySelectorAll(".todo-item:not(.dragging)"),
    ];

    return draggableElements.reduce(
      (closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;

        if (offset < 0 && offset > closest.offset) {
          return { offset: offset, element: child };
        } else {
          return closest;
        }
      },
      { offset: Number.NEGATIVE_INFINITY }
    ).element;
  }

  updateTodoOrder() {
    const todoItems = [...this.todosListBody.querySelectorAll(".todo-item")];
    const newOrder = todoItems.map((item) => item.getAttribute("data-id"));
    this.todoManager.reorderTodos(newOrder);
  }

  handleSearch(query) {
    this.currentSearchQuery = query;
    this.refreshDisplay();

    if (query.trim()) {
      this.highlightSearchResults(query);
    }
  }

  highlightSearchResults(query) {
    const todos = this.todosListBody.querySelectorAll(".todo-item");
    todos.forEach((todoElement) => {
      const taskCell = todoElement.querySelector("td:first-child");
      if (taskCell) {
        const originalText =
          taskCell.getAttribute("data-original") || taskCell.textContent;
        if (!taskCell.getAttribute("data-original")) {
          taskCell.setAttribute("data-original", originalText);
        }

        const regex = new RegExp(`(${query})`, "gi");
        const highlightedText = originalText.replace(
          regex,
          '<mark class="bg-yellow-200 text-black">$1</mark>'
        );
        taskCell.innerHTML = highlightedText;
      }
    });
  }

  handleAddTodo() {
    const task = this.taskInput.value.trim();
    const dueDate = this.dateInput.value;
    const parentId = this.taskInput.getAttribute("data-parent-id");
    const priorityKey = this.prioritySelect ? this.prioritySelect.value : "low";
    const priority = PRIORITY[priorityKey] ? PRIORITY[priorityKey].value : 0;

    if (task === "") {
      this.showAlertMessage("Please enter a task", "error");
      return;
    }

    try {
      if (this.isEditing && this.editingId) {
        // Update existing todo
        this.todoManager.editTodo(this.editingId, task);
        this.todoManager.setPriority(this.editingId, priorityKey);
        this.showAlertMessage("Task updated successfully", "success");
        this.resetEditMode();
      } else {
        // Add new todo
        const newTodo = this.todoManager.addTodo(task, dueDate, parentId, priority);
        const message = parentId
          ? "Subtask added successfully"
          : "Task added successfully";
        this.showAlertMessage(message, "success");
      }

      this.clearInputs();
    } catch (error) {
      this.showAlertMessage("Error processing task", "error");
      console.error(error);
    }
  }

  clearInputs() {
    this.taskInput.value = "";
    this.dateInput.value = "";
    this.taskInput.removeAttribute("data-parent-id");
    this.taskInput.placeholder = "Add a todo . . .";
    if (this.prioritySelect) this.prioritySelect.value = "low";
  }

  resetEditMode() {
    this.isEditing = false;
    this.editingId = null;
    this.addBtn.innerHTML = "<i class='bx bx-plus bx-sm'></i>";
    this.taskInput.placeholder = "Add a todo . . .";
  }

  showDeleteAllConfirmation() {
    if (this.todoManager.todos.length === 0) {
      this.showAlertMessage("No tasks to delete", "info");
      return;
    }

    this.showCustomModal(
      "Delete All Tasks",
      `Are you sure you want to delete all ${this.todoManager.todos.length} tasks? This action cannot be undone.`,
      [
        {
          text: "Cancel",
          class: "btn-ghost",
          action: () => this.hideCustomModal(),
        },
        {
          text: "Delete All",
          class: "btn-error",
          action: () => {
            this.handleClearAllTodos();
            this.hideCustomModal();
          },
        },
      ]
    );
  }

  showCustomModal(title, message, buttons) {
    const modal = document.createElement("div");
    modal.className = "modal modal-open";
    modal.innerHTML = `
      <div class="modal-box">
        <h3 class="font-bold text-lg">${title}</h3>
        <p class="py-4">${message}</p>
        <div class="modal-action">
          ${buttons
            .map(
              (btn, index) => `
            <button class="btn ${btn.class}" data-action="${index}">
              ${btn.text}
            </button>
          `
            )
            .join("")}
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Add event listeners for buttons
    buttons.forEach((btn, index) => {
      const button = modal.querySelector(`[data-action="${index}"]`);
      button.addEventListener("click", btn.action);
    });

    // Close on backdrop click
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        this.hideCustomModal(modal);
      }
    });

    this.currentModal = modal;
  }

  hideCustomModal(modal = this.currentModal) {
    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
    this.currentModal = null;
  }

  handleClearAllTodos() {
    try {
      this.todoManager.clearAllTodos();
      this.showAlertMessage("All tasks cleared successfully", "success");
    } catch (error) {
      this.showAlertMessage("Error clearing tasks", "error");
      console.error(error);
    }
  }

  showAllTodos() {
    this.currentFilter = "all";
    this.refreshDisplay();
  }

  refreshDisplay() {
    const todos = this.todoManager.filterTodos(
      this.currentFilter,
      this.currentSearchQuery,
      this.currentPriorityFilter
    );
    this.displayTodos(todos);
    this.updateProgressDisplay();
  }

  displayTodos(todos) {
    if (!this.todosListBody) return;

    this.todosListBody.innerHTML = "";

    if (todos.length === 0) {
      const message = this.currentSearchQuery
        ? `No tasks found matching "${this.currentSearchQuery}"`
        : "No tasks found";
      this.todosListBody.innerHTML = `<tr><td colspan="5" class="text-center py-8">${message}</td></tr>`;
      return;
    }

    // Separate parent todos and subtasks
    const parentTodos = todos.filter((todo) => !todo.parent);

    parentTodos.forEach((todo) => {
      this.renderTodoItem(todo, 0);

      // Render subtasks if expanded
      if (todo.isExpanded && todo.subtasks && todo.subtasks.length > 0) {
        todo.subtasks.forEach((subtaskId) => {
          const subtask = this.todoManager.todos.find(
            (t) => t.id === subtaskId
          );
          if (subtask && todos.includes(subtask)) {
            this.renderTodoItem(subtask, 1);
          }
        });
      }
    });
  }

  renderTodoItem(todo, indentLevel = 0) {
    const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;
    const isExpanded = todo.isExpanded;
    const indentClass = indentLevel > 0 ? `ml-${indentLevel * 6}` : "";

    const taskDisplay = this.todoItemFormatter.formatTaskForDisplay(
      this.todoItemFormatter.formatTask(todo.originalTask, false)
    );

    const row = document.createElement("tr");
    row.className = `todo-item ${todo.completed ? "opacity-60" : ""} ${
      indentLevel > 0 ? "subtask" : ""
    }`;
    row.setAttribute("data-id", todo.id);
    row.setAttribute("data-priority", getPriorityKey(todo.priority));
    row.draggable = indentLevel === 0; // Only parent todos are draggable

    row.innerHTML = `
      <td class="${indentClass}">
        <div class="flex items-center">
          ${
            hasSubtasks
              ? `
            <button class="btn btn-ghost btn-xs mr-2 expand-btn" data-id="${
              todo.id
            }">
              <i class="bx ${
                isExpanded ? "bx-chevron-down" : "bx-chevron-right"
              }"></i>
            </button>
          `
              : indentLevel > 0
              ? '<div class="w-6"></div>'
              : ""
          }
          <span class="${
            todo.completed ? "line-through" : ""
          }" data-original="${todo.originalTask}">
            ${taskDisplay}
          </span>
          ${
            hasSubtasks
              ? `<span class="badge badge-sm ml-2">${todo.subtasks.length}</span>`
              : ""
          }
        </div>
      </td>
      <td>${this.todoItemFormatter.formatDueDate(todo.dueDate)}</td>
      <td>
        <div class="badge ${
          todo.completed ? "badge-success" : "badge-warning"
        }">
          ${this.todoItemFormatter.formatStatus(todo.completed)}
        </div>
      </td>
      <td>
        <div class="flex items-center gap-1">
          ${this.buildPriorityBadge(todo.priority)}
          ${this.buildInlinePrioritySelect(todo)}
        </div>
      </td>
      <td>
        <div class="flex gap-1">
          ${
            indentLevel === 0
              ? `
            <button class="btn btn-info btn-xs add-subtask-btn" data-id="${todo.id}" title="Add Subtask">
              <i class="bx bx-plus"></i>
            </button>
          `
              : ""
          }
          <button class="btn btn-warning btn-xs edit-btn" data-id="${
            todo.id
          }" title="Edit">
            <i class="bx bx-edit-alt"></i>    
          </button>
          <button class="btn btn-success btn-xs toggle-btn" data-id="${
            todo.id
          }" title="${todo.completed ? "Mark Incomplete" : "Mark Complete"}">
            <i class="bx ${todo.completed ? "bx-x" : "bx-check"}"></i>
          </button>
          <button class="btn btn-error btn-xs delete-btn" data-id="${
            todo.id
          }" title="Delete">
            <i class="bx bx-trash"></i>
          </button>
        </div>
      </td>
    `;

    this.todosListBody.appendChild(row);

    // Add event listeners for this row
    this.addRowEventListeners(row, todo);
  }

  addRowEventListeners(row, todo) {
    const expandBtn = row.querySelector(".expand-btn");
    const addSubtaskBtn = row.querySelector(".add-subtask-btn");
    const editBtn = row.querySelector(".edit-btn");
    const toggleBtn = row.querySelector(".toggle-btn");
    const deleteBtn = row.querySelector(".delete-btn");
    const inlinePriority = row.querySelector(".inline-priority-select");

    if (expandBtn) {
      expandBtn.addEventListener("click", () =>
        this.handleToggleExpand(todo.id)
      );
    }

    if (addSubtaskBtn) {
      addSubtaskBtn.addEventListener("click", () =>
        this.handleAddSubtask(todo.id)
      );
    }

    if (editBtn) {
      editBtn.addEventListener("click", () => this.handleEditTodo(todo.id));
    }

    if (toggleBtn) {
      toggleBtn.addEventListener("click", () =>
        this.handleToggleStatus(todo.id)
      );
    }

    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => this.handleDeleteTodo(todo.id));
    }

    if (inlinePriority) {
      inlinePriority.addEventListener("change", (e) => {
        const newKey = e.target.value;
        inlinePriority.className = inlinePriority.className.replace(
          /priority-inline-\w+/,
          `priority-inline-${newKey}`
        );
        this.todoManager.setPriority(todo.id, newKey);
      });
    }
  }

  handleToggleExpand(id) {
    this.todoManager.toggleExpanded(id);
  }

  handleAddSubtask(parentId) {
    this.taskInput.setAttribute("data-parent-id", parentId);
    const parentTodo = this.todoManager.todos.find((t) => t.id === parentId);
    this.taskInput.placeholder = `Add subtask to: ${
      parentTodo ? parentTodo.originalTask : "task"
    }`;
    this.taskInput.focus();
  }

  handleEditTodo(id) {
    const todo = this.todoManager.todos.find((t) => t.id === id);
    if (todo) {
      this.taskInput.value = todo.originalTask;
      this.dateInput.value = todo.dueDate !== "No due date" ? todo.dueDate : "";
      if (this.prioritySelect) {
        this.prioritySelect.value = getPriorityKey(todo.priority);
      }
      this.isEditing = true;
      this.editingId = id;
      this.addBtn.innerHTML = "<i class='bx bx-check bx-sm'></i>";
      this.taskInput.placeholder = "Update task...";
      this.taskInput.focus();
    }
  }

  buildPriorityBadge(priorityValue) {
    const key = getPriorityKey(priorityValue);
    const cfg = PRIORITY[key];
    return `<span class="priority-badge ${cfg.badge}"><i class="bx ${cfg.icon}"></i>${cfg.label}</span>`;
  }

  buildInlinePrioritySelect(todo) {
    const currentKey = getPriorityKey(todo.priority);
    const options = PRIORITY_KEYS.map((key) => {
      const cfg = PRIORITY[key];
      return `<option value="${key}" ${currentKey === key ? "selected" : ""}>${cfg.label}</option>`;
    }).join("");

    return `
      <select class="inline-priority-select priority-inline-${currentKey}" data-id="${todo.id}">
        ${options}
      </select>`;
  }

  handleToggleStatus(id) {
    this.todoManager.toggleTodoStatus(id);
  }

  handleDeleteTodo(id) {
    const todo = this.todoManager.todos.find((t) => t.id === id);
    if (!todo) return;

    const hasSubtasks = todo.subtasks && todo.subtasks.length > 0;
    const isSubtask = !!todo.parent;

    let message = `Are you sure you want to delete this ${
      isSubtask ? "subtask" : "task"
    }?`;
    if (hasSubtasks) {
      message += ` This will also delete all ${todo.subtasks.length} subtask(s).`;
    }

    this.showCustomModal("Delete Task", message, [
      {
        text: "Cancel",
        class: "btn-ghost",
        action: () => this.hideCustomModal(),
      },
      {
        text: "Delete",
        class: "btn-error",
        action: () => {
          this.todoManager.deleteTodo(id);
          this.showAlertMessage(
            `${isSubtask ? "Subtask" : "Task"} deleted successfully`,
            "success"
          );
          this.hideCustomModal();
        },
      },
    ]);
  }

  handleFilterTodos(status) {
    this.currentFilter = status;
    this.refreshDisplay();

    // Update active filter button
    document.querySelectorAll(".todos-filter li a").forEach((link) => {
      link.classList.remove("active");
    });

    const activeButton = document.querySelector(
      `.todos-filter li a[data-filter="${status}"]`
    );
    if (activeButton) {
      activeButton.classList.add("active");
    }
  }

  updateProgressDisplay() {
    const stats = this.todoManager.getStatistics();

    // Update progress bar
    const progressBar = document.querySelector(".progress-bar");
    if (progressBar) {
      progressBar.style.width = `${stats.completionPercentage}%`;
      progressBar.setAttribute("aria-valuenow", stats.completionPercentage);
    }

    // Update counters
    const totalCounter = document.querySelector(".total-counter");
    const completedCounter = document.querySelector(".completed-counter");
    const pendingCounter = document.querySelector(".pending-counter");
    const percentageDisplay = document.querySelector(".percentage-display");

    if (totalCounter) totalCounter.textContent = stats.total;
    if (completedCounter) completedCounter.textContent = stats.completed;
    if (pendingCounter) pendingCounter.textContent = stats.pending;
    if (percentageDisplay)
      percentageDisplay.textContent = `${stats.completionPercentage}%`;
  }

  showAlertMessage(message, type) {
    if (!this.alertMessage) return;

    const alertBox = `
      <div class="alert alert-${type} shadow-lg mb-5 w-full animate-pulse">
        <div>
          <i class="bx ${this.getAlertIcon(type)} bx-sm"></i>
          <span>${message}</span>
        </div>
      </div>
    `;

    this.alertMessage.innerHTML = alertBox;
    this.alertMessage.classList.remove("hide");
    this.alertMessage.classList.add("show");

    setTimeout(() => {
      this.alertMessage.classList.remove("show");
      this.alertMessage.classList.add("hide");
    }, 3000);
  }

  getAlertIcon(type) {
    switch (type) {
      case "success":
        return "bx-check-circle";
      case "error":
        return "bx-error-circle";
      case "warning":
        return "bx-error";
      case "info":
        return "bx-info-circle";
      default:
        return "bx-info-circle";
    }
  }
}

// Main TodoApp class that orchestrates all components
class TodoApp {
  constructor() {
    this.todoItemFormatter = new TodoItemFormatter();
    this.todoManager = new TodoManager(this.todoItemFormatter);
    this.uiManager = new UIManager(this.todoManager, this.todoItemFormatter);
    this.themeSwitcher = this.initializeThemeSwitcher();

    this.initialize();
  }

  initialize() {
    // Setup global error handling
    window.addEventListener("error", (event) => {
      console.error("Application Error:", event.error);
      this.uiManager.showAlertMessage("An unexpected error occurred", "error");
    });

    // Setup keyboard shortcuts
    this.setupGlobalKeyboardShortcuts();

    // Initialize with saved state
    this.loadApplicationState();

    console.log("TodoApp initialized successfully");
  }

  initializeThemeSwitcher() {
    const themes = document.querySelectorAll(".theme-item");
    const html = document.querySelector("html");
    return new ThemeSwitcher(themes, html);
  }

  setupGlobalKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      // Ctrl/Cmd + N: Add new task
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        this.uiManager.taskInput.focus();
      }

      // Ctrl/Cmd + A: Show all tasks
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key === "a" &&
        !e.target.matches("input, textarea")
      ) {
        e.preventDefault();
        this.uiManager.handleFilterTodos("all");
      }

      // Escape: Cancel current operation
      if (e.key === "Escape") {
        this.uiManager.resetEditMode();
        this.uiManager.clearInputs();
      }
    });
  }

  loadApplicationState() {
    // Load any application-wide state
    const lastFilter = localStorage.getItem("lastFilter") || "all";
    this.uiManager.handleFilterTodos(lastFilter);
  }

  saveApplicationState() {
    localStorage.setItem("lastFilter", this.uiManager.currentFilter);
  }

  // Public API methods for external integrations
  exportTodos() {
    return {
      todos: this.todoManager.todos,
      statistics: this.todoManager.getStatistics(),
      exportDate: new Date().toISOString(),
    };
  }

  importTodos(data) {
    try {
      if (data.todos && Array.isArray(data.todos)) {
        this.todoManager.todos = data.todos;
        this.todoManager.saveToLocalStorage();
        this.uiManager.refreshDisplay();
        this.uiManager.showAlertMessage(
          "Tasks imported successfully",
          "success"
        );
      }
    } catch (error) {
      console.error("Import error:", error);
      this.uiManager.showAlertMessage("Import failed", "error");
    }
  }

  resetApplication() {
    if (confirm("This will delete all data. Are you sure?")) {
      localStorage.clear();
      location.reload();
    }
  }

  getApplicationInfo() {
    return {
      version: "2.0.0",
      todoCount: this.todoManager.todos.length,
      statistics: this.todoManager.getStatistics(),
      currentFilter: this.uiManager.currentFilter,
      theme: this.themeSwitcher.getThemeFromLocalStorage(),
    };
  }
}

// Class responsible for managing the theme switcher
class ThemeSwitcher {
  constructor(themes, html) {
    this.themes = themes;
    this.html = html;
    this.init();
  }

  init() {
    const theme = this.getThemeFromLocalStorage();
    if (theme) {
      this.setTheme(theme);
    }

    this.addThemeEventListeners();
  }

  addThemeEventListeners() {
    this.themes.forEach((theme) => {
      theme.addEventListener("click", () => {
        const themeName = theme.getAttribute("theme");
        this.setTheme(themeName);
        this.saveThemeToLocalStorage(themeName);
      });
    });
  }

  setTheme(themeName) {
    this.html.setAttribute("data-theme", themeName);
  }

  saveThemeToLocalStorage(themeName) {
    localStorage.setItem("theme", themeName);
  }

  getThemeFromLocalStorage() {
    return localStorage.getItem("theme");
  }
}

// Initialize the TodoApp
let todoApp;

// DOM Content Loaded Event
document.addEventListener("DOMContentLoaded", () => {
  try {
    todoApp = new TodoApp();

    // Make app available globally for debugging
    if (typeof window !== "undefined") {
      window.todoApp = todoApp;
    }

    // Save application state before page unload
    window.addEventListener("beforeunload", () => {
      todoApp.saveApplicationState();
    });
  } catch (error) {
    console.error("Failed to initialize TodoApp:", error);

    // Fallback initialization
    const todoItemFormatter = new TodoItemFormatter();
    const todoManager = new TodoManager(todoItemFormatter);
    window.uiManager = new UIManager(todoManager, todoItemFormatter);
    const themes = document.querySelectorAll(".theme-item");
    const html = document.querySelector("html");
    const themeSwitcher = new ThemeSwitcher(themes, html);
  }
});

// Legacy support for existing onclick handlers
window.filterTodos = function (status) {
  if (todoApp && todoApp.uiManager) {
    todoApp.uiManager.handleFilterTodos(status);
  }
};
