(function (global) {
  'use strict';

  function nextSegmentIndex(currentIndex, length, key) {
    const count = Math.max(0, Number(length) || 0);
    if (!count) return -1;
    const current = Math.min(count - 1, Math.max(0, Number(currentIndex) || 0));
    if (key === 'Home') return 0;
    if (key === 'End') return count - 1;
    if (key === 'ArrowLeft' || key === 'ArrowUp') {
      return (current - 1 + count) % count;
    }
    if (key === 'ArrowRight' || key === 'ArrowDown') {
      return (current + 1) % count;
    }
    return current;
  }

  function availableRadioButtons(group) {
    return Array.from(group.children).filter(button => (
      button.matches('button[role="radio"]') && !button.hidden && !button.disabled
    ));
  }

  function syncSegmentTabStops(group) {
    const buttons = availableRadioButtons(group);
    if (!buttons.length) return;
    const selected = buttons.find(button => button.classList.contains('is-active')) || buttons[0];
    buttons.forEach(button => {
      const active = button === selected;
      button.tabIndex = active ? 0 : -1;
      button.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  }

  function initSegmentedControls(root) {
    root.querySelectorAll('.segmented[role="radiogroup"]').forEach(group => {
      syncSegmentTabStops(group);

      group.addEventListener('click', event => {
        if (!event.target.closest('button[role="radio"]')) return;
        syncSegmentTabStops(group);
      });

      group.addEventListener('keydown', event => {
        const keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'];
        if (!keys.includes(event.key)) return;

        const buttons = availableRadioButtons(group);
        if (!buttons.length) return;
        const currentIndex = Math.max(0, buttons.indexOf(root.activeElement));
        const nextIndex = nextSegmentIndex(currentIndex, buttons.length, event.key);
        const nextButton = buttons[nextIndex];
        if (!nextButton) return;

        event.preventDefault();
        nextButton.focus();
        nextButton.click();
        syncSegmentTabStops(group);
      });
    });
  }

  function setFoldOpen(section, isOpen) {
    if (!section) return;
    const trigger = section.querySelector('.fold-trigger');
    const body = section.querySelector('.fold-body');
    if (!trigger || !body) return;

    const open = Boolean(isOpen);
    section.dataset.open = String(open);
    trigger.setAttribute('aria-expanded', String(open));
    body.hidden = !open;

    const meta = trigger.querySelector('.fold-meta');
    if (meta) {
      const label = open ? meta.dataset.expandedLabel : meta.dataset.collapsedLabel;
      if (label) meta.textContent = label;
    }
  }

  function initFoldSections(root) {
    root.querySelectorAll('.fold-section').forEach(section => {
      const trigger = section.querySelector('.fold-trigger');
      if (!trigger) return;
      const isOpen = section.dataset.open === 'true'
        || trigger.getAttribute('aria-expanded') === 'true';
      setFoldOpen(section, isOpen);
      trigger.addEventListener('click', () => {
        setFoldOpen(section, section.dataset.open !== 'true');
      });
    });

    const transportSection = root.getElementById('transportSection');
    const filterTabs = root.getElementById('filterTabs');
    if (filterTabs && transportSection) {
      filterTabs.addEventListener('click', event => {
        const filterButton = event.target.closest('[data-filter]');
        if (!filterButton) return;
        setFoldOpen(transportSection, filterButton.dataset.filter === 'transport');
      });
    }
  }

  function initDraftPresentation(root) {
    const draftList = root.getElementById('draftNodeList');
    const draftStatus = root.getElementById('draftStatus');

    const clearDragState = () => {
      draftList?.querySelectorAll('.draft-node').forEach(node => {
        node.classList.remove('is-dragging', 'is-drag-over');
        node.setAttribute('aria-grabbed', 'false');
      });
    };

    if (draftList) {
      draftList.addEventListener('dragstart', event => {
        const node = event.target.closest('.draft-node[draggable="true"]');
        if (!node) return;
        clearDragState();
        node.classList.add('is-dragging');
        node.setAttribute('aria-grabbed', 'true');
      }, true);
      draftList.addEventListener('dragover', event => {
        const target = event.target.closest('.draft-node');
        draftList.querySelectorAll('.draft-node.is-drag-over').forEach(node => {
          if (node !== target) node.classList.remove('is-drag-over');
        });
        if (target) target.classList.add('is-drag-over');
      }, true);
      draftList.addEventListener('drop', () => global.setTimeout(clearDragState, 0), true);
      draftList.addEventListener('dragend', clearDragState, true);
    }

    if (draftStatus && global.MutationObserver) {
      let lastStatus = draftStatus.textContent;
      const statusObserver = new global.MutationObserver(() => {
        const nextStatus = draftStatus.textContent;
        if (nextStatus === lastStatus) return;
        lastStatus = nextStatus;
        draftStatus.classList.add('is-updated');
        global.setTimeout(() => draftStatus.classList.remove('is-updated'), 900);
      });
      statusObserver.observe(draftStatus, { childList: true, characterData: true, subtree: true });
    }
  }

  function init(root) {
    if (!root?.querySelectorAll) return;
    initSegmentedControls(root);
    initFoldSections(root);
    initDraftPresentation(root);
  }

  const api = Object.freeze({
    init,
    nextSegmentIndex,
    setFoldOpen,
    syncSegmentTabStops
  });

  global.AeroTravelInteractions = api;
  if (global.document) init(global.document);
})(typeof window !== 'undefined' ? window : globalThis);
