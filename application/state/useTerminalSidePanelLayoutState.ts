import { useCallback, useEffect, useRef, useState } from 'react';

import {
  closeSidePanelPane,
  createSidePanelLayout,
  focusSidePanelPane,
  getFocusedSidePanelPane,
  resizeSidePanelSplit,
  selectSidePanelTool,
  splitSidePanelPane,
  type SidePanelLayout,
  type SidePanelSplitDirection,
  type SidePanelTool,
} from '../../domain/sidePanelLayout';

export function useTerminalSidePanelLayoutState() {
  const [sidePanelOpenTabs, setSidePanelOpenTabs] = useState<Map<string, SidePanelTool>>(new Map());
  const [sidePanelLayouts, setSidePanelLayouts] = useState<Map<string, SidePanelLayout>>(new Map());
  const sidePanelOpenTabsRef = useRef(sidePanelOpenTabs);
  const sidePanelLayoutsRef = useRef(sidePanelLayouts);
  sidePanelOpenTabsRef.current = sidePanelOpenTabs;
  sidePanelLayoutsRef.current = sidePanelLayouts;

  // Legacy and external open paths write the focused-tool map. Reconcile that
  // public application boundary into the per-tab tree without disturbing the
  // other panes in an existing layout. Skip the setState when the click path
  // already stored this selection: scheduling an identical update still
  // renders again after a paired openTabs write.
  useEffect(() => {
    const previous = sidePanelLayoutsRef.current;
    let changed = false;
    const next = new Map(previous);

    for (const tabId of previous.keys()) {
      if (!sidePanelOpenTabs.has(tabId)) {
        next.delete(tabId);
        changed = true;
      }
    }

    for (const [tabId, tool] of sidePanelOpenTabs) {
      const current = next.get(tabId);
      const updated = current
        ? selectSidePanelTool(current, tool)
        : createSidePanelLayout(tool, crypto.randomUUID());
      if (updated !== current) {
        next.set(tabId, updated);
        changed = true;
      }
    }

    if (!changed) return;
    sidePanelLayoutsRef.current = next;
    setSidePanelLayouts(next);
  }, [sidePanelOpenTabs]);

  const commitLayout = useCallback((tabId: string, layout: SidePanelLayout) => {
    const layouts = new Map(sidePanelLayoutsRef.current).set(tabId, layout);
    const focusedTool = getFocusedSidePanelPane(layout).tool;
    const openTabs = new Map(sidePanelOpenTabsRef.current).set(tabId, focusedTool);
    sidePanelLayoutsRef.current = layouts;
    sidePanelOpenTabsRef.current = openTabs;
    setSidePanelLayouts(layouts);
    setSidePanelOpenTabs(openTabs);
  }, []);

  // Click path writes the focused tool and the layout together. The effect
  // above still reconciles external openTabs writes, and skips when
  // selectSidePanelTool returns the layout this call just stored.
  const selectSidePanelToolForTab = useCallback((tabId: string, tool: SidePanelTool) => {
    const current = sidePanelLayoutsRef.current.get(tabId);
    const updated = current
      ? selectSidePanelTool(current, tool)
      : createSidePanelLayout(tool, crypto.randomUUID());
    if (updated === current && sidePanelOpenTabsRef.current.get(tabId) === tool) return;
    commitLayout(tabId, updated);
  }, [commitLayout]);

  const focusPane = useCallback((tabId: string, paneId: string) => {
    const layout = sidePanelLayoutsRef.current.get(tabId);
    if (!layout) return;
    const nextLayout = focusSidePanelPane(layout, paneId);
    if (nextLayout !== layout) commitLayout(tabId, nextLayout);
  }, [commitLayout]);

  const splitPane = useCallback((
    tabId: string,
    tool: SidePanelTool,
    direction: SidePanelSplitDirection,
    ids: { paneId: string; splitId: string },
    availableAxisLength: number,
  ) => {
    const layout = sidePanelLayoutsRef.current.get(tabId);
    if (!layout) return;
    commitLayout(tabId, splitSidePanelPane(
      layout,
      layout.focusedPaneId,
      tool,
      direction,
      ids,
      availableAxisLength,
    ));
  }, [commitLayout]);

  const closePane = useCallback((tabId: string, paneId: string): boolean => {
    const layout = sidePanelLayoutsRef.current.get(tabId);
    if (!layout) return false;
    const nextLayout = closeSidePanelPane(layout, paneId);
    if (nextLayout) {
      commitLayout(tabId, nextLayout);
      return false;
    }

    const layouts = new Map(sidePanelLayoutsRef.current);
    const openTabs = new Map(sidePanelOpenTabsRef.current);
    layouts.delete(tabId);
    openTabs.delete(tabId);
    sidePanelLayoutsRef.current = layouts;
    sidePanelOpenTabsRef.current = openTabs;
    setSidePanelLayouts(layouts);
    setSidePanelOpenTabs(openTabs);
    return true;
  }, [commitLayout]);

  const resizeSplit = useCallback((tabId: string, splitId: string, sizes: number[]) => {
    const layout = sidePanelLayoutsRef.current.get(tabId);
    if (!layout) return;
    const nextLayout = resizeSidePanelSplit(layout, splitId, sizes);
    if (nextLayout === layout) return;
    const layouts = new Map(sidePanelLayoutsRef.current).set(tabId, nextLayout);
    sidePanelLayoutsRef.current = layouts;
    setSidePanelLayouts(layouts);
  }, []);

  return {
    sidePanelOpenTabs,
    setSidePanelOpenTabs,
    sidePanelOpenTabsRef,
    sidePanelLayouts,
    setSidePanelLayouts,
    sidePanelLayoutsRef,
    focusPane,
    splitPane,
    closePane,
    resizeSplit,
    selectSidePanelToolForTab,
  };
}
