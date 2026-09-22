"use client";

import { Plus, Trash2, ChevronUp, ChevronDown, FileImage } from "lucide-react";
import { useDesigner } from "./store";
import { cn } from "@/lib/utils/cn";

export function PagesPanel() {
  const template = useDesigner((s) => s.template);
  const pageIndex = useDesigner((s) => s.pageIndex);
  const readOnly = useDesigner((s) => s.readOnly);
  const { setPage, addPage, removePage, movePage } = useDesigner.getState();
  if (!template) return null;

  return (
    <div className="flex h-full w-40 shrink-0 flex-col border-r border-ink-200 bg-ink-50">
      <div className="flex items-center justify-between border-b border-ink-200 px-2 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Pages</span>
        {!readOnly && (
          <button onClick={addPage} title="Add page" className="rounded p-0.5 text-ink-600 hover:bg-ink-200">
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {template.pages.map((p, i) => (
          <div
            key={p.id}
            onClick={() => setPage(i)}
            className={cn("group mb-2 cursor-pointer rounded border bg-white p-1.5 text-xs", i === pageIndex ? "border-ink-900 ring-1 ring-ink-900" : "border-ink-200 hover:border-ink-400")}
          >
            <div className="flex aspect-[210/297] items-center justify-center rounded-sm border border-ink-100 bg-white text-ink-300">
              {p.background ? <FileImage className="h-5 w-5" /> : <span className="text-[10px]">blank</span>}
            </div>
            <div className="mt-1 flex items-center justify-between">
              <span className="truncate font-medium text-ink-700">{i + 1}. {p.name ?? `Page ${i + 1}`}</span>
            </div>
            <div className="text-[10px] text-ink-400">{p.elements.length} element(s)</div>
            {!readOnly && (
              <div className="mt-1 hidden justify-end gap-0.5 group-hover:flex">
                <button disabled={i === 0} onClick={(e) => { e.stopPropagation(); movePage(i, i - 1); }} className="rounded p-0.5 hover:bg-ink-100 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                <button disabled={i === template.pages.length - 1} onClick={(e) => { e.stopPropagation(); movePage(i, i + 1); }} className="rounded p-0.5 hover:bg-ink-100 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                <button disabled={template.pages.length <= 1} onClick={(e) => { e.stopPropagation(); if (confirm(`Remove page ${i + 1}?`)) removePage(i); }} className="rounded p-0.5 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 className="h-3 w-3" /></button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
