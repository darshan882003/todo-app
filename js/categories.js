/**
 * Categories/Tags management
 */

import { getAppData, saveAppData, addCategory, updateCategory, deleteCategory } from './db.js';

const DEFAULT_CATEGORIES = [
  { id: 'cat-health', name: 'Health', color: '#5eead4', icon: '💪' },
  { id: 'cat-work', name: 'Work', color: '#8b7cff', icon: '💼' },
  { id: 'cat-learning', name: 'Learning', color: '#ffc86b', icon: '📚' },
  { id: 'cat-personal', name: 'Personal', color: '#ff7a9c', icon: '🏠' }
];

let categories = [];

function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }

function toast(msg) {
  const t = $('#toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove('on'), 2400);
  }
}

async function loadCategories() {
  const data = await getAppData();
  categories = data.categories || [...DEFAULT_CATEGORIES];
  if (!data.categories) {
    data.categories = categories;
    await saveAppData(data);
  }
  return categories;
}

function getCategories() {
  return categories;
}

function getCategoryById(id) {
  return categories.find(c => c.id === id);
}

async function createCategory(name, color, icon) {
  const category = {
    id: 'cat-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    name: name.trim(),
    color: color || '#8b7cff',
    icon: icon || '📁'
  };

  await addCategory(category);
  categories.push(category);
  return category;
}

async function updateCategoryById(id, updates) {
  const index = categories.findIndex(c => c.id === id);
  if (index === -1) return;

  Object.assign(categories[index], updates);
  await updateCategory(index, categories[index]);
  return categories[index];
}

async function deleteCategoryById(id) {
  const index = categories.findIndex(c => c.id === id);
  if (index === -1) return;

  categories.splice(index, 1);
  await deleteCategory(index);
}

function getCategoryColors() {
  return [
    '#5eead4', '#8b7cff', '#ffc86b', '#ff7a9c',
    '#f472b6', '#60a5fa', '#34d399', '#fbbf24',
    '#fb923c', '#a78bfa', '#22d3ee', '#f87171'
  ];
}

function renderCategoryPicker(selectedId, onSelect) {
  const colors = getCategoryColors();
  return categories.map(cat => `
    <button type="button" class="category-option ${cat.id === selectedId ? 'selected' : ''}"
      data-id="${cat.id}" style="--cat-color: ${cat.color}">
      <span class="category-dot" style="background: ${cat.color}"></span>
      <span>${escapeHtml(cat.name)}</span>
    </button>
  `).join('');
}

function renderCategoryManager() {
  const container = $('#categoryList');
  if (!container) return;

  container.innerHTML = categories.map((cat, index) => `
    <div class="category-manager-item" data-id="${cat.id}">
      <div class="category-info">
        <span class="category-dot" style="background: ${cat.color}"></span>
        <span class="category-name">${escapeHtml(cat.name)}</span>
        <span class="category-color-code">${cat.color}</span>
      </div>
      <div class="category-actions">
        <button class="edit-category" data-id="${cat.id}" aria-label="Edit">✎</button>
        <button class="delete-category" data-id="${cat.id}" aria-label="Delete">×</button>
      </div>
    </div>
  `).join('');

  $$('#categoryList .edit-category').forEach(btn => {
    btn.addEventListener('click', () => openCategorySheet(btn.dataset.id));
  });

  $$('#categoryList .delete-category').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (confirm('Delete this category? Goals using it will become uncategorized.')) {
        await deleteCategoryById(btn.dataset.id);
        renderCategoryManager();
        toast('Category deleted');
      }
    });
  });
}

function openCategorySheet(categoryId = null) {
  const sheet = $('#editSheet');
  const panel = $('#editPanel');
  if (!sheet || !panel) return;

  const isNew = !categoryId;
  const category = categoryId ? getCategoryById(categoryId) : null;
  const colors = getCategoryColors();

  panel.innerHTML = `
    <h3>${isNew ? 'New Category' : 'Edit Category'}</h3>
    <div class="edit-field">
      <label for="catName">Name</label>
      <input type="text" id="catName" maxlength="20" value="${category ? escapeHtml(category.name) : ''}" placeholder="e.g. Fitness" autocomplete="off">
    </div>
    <div class="edit-field">
      <label>Color</label>
      <div class="color-picker">
        ${colors.map(c => `
          <button type="button" class="color-btn ${category?.color === c ? 'selected' : ''}" data-color="${c}" style="background: ${c}"></button>
        `).join('')}
      </div>
    </div>
    <div class="edit-field">
      <label for="catIcon">Icon (emoji)</label>
      <input type="text" id="catIcon" maxlength="2" value="${category?.icon || '📁'}" placeholder="📁">
    </div>
    <div class="edit-actions">
      <button class="btn" id="cancelCategory">Cancel</button>
      <button class="btn" id="saveCategory">${isNew ? 'Add' : 'Save'}</button>
    </div>
  `;

  let selectedColor = category?.color || colors[0];

  $$('.color-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.color-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedColor = btn.dataset.color;
    });
  });

  $('#cancelCategory').addEventListener('click', () => closeCategorySheet());
  $('#saveCategory').addEventListener('click', async () => {
    const name = $('#catName').value.trim();
    if (!name) return toast('Enter a category name');
    const icon = $('#catIcon').value || '📁';

    if (isNew) {
      await createCategory(name, selectedColor, icon);
      toast('Category added');
    } else {
      await updateCategoryById(categoryId, { name, color: selectedColor, icon });
      toast('Category updated');
    }

    closeCategorySheet();
    renderCategoryManager();
  });

  sheet.classList.add('on');
}

function closeCategorySheet() {
  $('#editSheet')?.classList.remove('on');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export {
  loadCategories,
  getCategories,
  getCategoryById,
  createCategory,
  updateCategoryById,
  deleteCategoryById,
  getCategoryColors,
  renderCategoryPicker,
  renderCategoryManager,
  openCategorySheet,
  closeCategorySheet
};