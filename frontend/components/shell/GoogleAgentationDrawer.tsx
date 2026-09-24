'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Bot,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Copy,
  Trash2,
  ExternalLink,
  Code2,
  Terminal,
  MousePointerClick,
  RefreshCw,
} from 'lucide-react';
import { useUniverseStore } from '@/store/useUniverseStore';

interface PendingAnnotation {
  id: string;
  comment: string;
  element: string;
  elementPath: string;
  timestamp: number;
  status?: string;
  cssClasses?: string;
}

export default function GoogleAgentationDrawer() {
  const isAgentationOpen = useUniverseStore((state) => state.isAgentationOpen);
  const toggleAgentation = useUniverseStore((state) => state.toggleAgentation);

  const [isMcpOnline, setIsMcpOnline] = useState<boolean | null>(null);
  const [annotations, setAnnotations] = useState<PendingAnnotation[]>([]);
  const [copiedCmd, setCopiedCmd] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Poll MCP health and pending annotations
  const checkMcpStatus = useCallback(async () => {
    try {
      const res = await fetch('http://localhost:4747/health', { cache: 'no-store' });
      if (res.ok) {
        setIsMcpOnline(true);
        // Fetch pending annotations
        const pendingRes = await fetch('http://localhost:4747/pending', { cache: 'no-store' });
        if (pendingRes.ok) {
          const data = await pendingRes.json();
          setAnnotations(data.annotations || []);
        }
      } else {
        setIsMcpOnline(false);
      }
    } catch {
      setIsMcpOnline(false);
    }
  }, []);

  useEffect(() => {
    if (!isAgentationOpen) return;
    checkMcpStatus();
    const interval = setInterval(checkMcpStatus, 4000);

    const handleUpdate = () => {
      checkMcpStatus();
    };
    window.addEventListener('agentation:updated', handleUpdate);
    window.addEventListener('agentation:submitted', handleUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('agentation:updated', handleUpdate);
      window.removeEventListener('agentation:submitted', handleUpdate);
    };
  }, [isAgentationOpen, checkMcpStatus]);

  if (!isAgentationOpen) return null;

  const handleLaunchAnnotation = () => {
    // Dispatch custom event to trigger Agentation feedback mode
    window.dispatchEvent(new CustomEvent('agentation:toggle'));
    // Minimize drawer so user can annotate canvas and UI
    toggleAgentation();
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await checkMcpStatus();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleCopyCommand = () => {
    navigator.clipboard.writeText('npx agentation-mcp server');
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 2000);
  };

  const handleCopySummary = () => {
    if (annotations.length === 0) return;
    const text = annotations
      .map(
        (a, i) =>
          `### ${i + 1}. Feedback on \`${a.element || a.elementPath}\`\n- **Selector**: \`${a.elementPath}\`\n- **Comment**: ${a.comment}\n- **ID**: \`${a.id}\``
      )
      .join('\n\n');
    navigator.clipboard.writeText(text);
    setCopiedSummary(true);
    setTimeout(() => setCopiedSummary(false), 2000);
  };

  const handleResolveAnnotation = async (id: string) => {
    try {
      await fetch(`http://localhost:4747/annotations/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to resolve annotation:', err);
    }
  };

  const handleDeleteAnnotation = async (id: string) => {
    try {
      await fetch(`http://localhost:4747/annotations/${id}`, {
        method: 'DELETE',
      });
      setAnnotations((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  return (
    <div
      id="google-agentation-wide-dock"
      className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2.5rem)] max-w-[1240px] bg-[#1B1C1D]/95 backdrop-blur-2xl border border-white/15 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-4 sm:p-5 select-none animate-in fade-in slide-in-from-bottom-6 duration-200 flex flex-col gap-3.5"
    >
      {/* 1. Header Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-[#C58AF9]/15 border border-[#C58AF9]/30 flex items-center justify-center shrink-0">
            <Bot className="w-4 h-4 text-[#C58AF9]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[#E3E3E3] tracking-tight font-google-sans">
                Agentation MCP Studio
              </h3>
              {isMcpOnline === true && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#81C995]/15 text-[#81C995] border border-[#81C995]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#81C995] animate-pulse" />
                  MCP Server Active (Port 4747)
                </span>
              )}
              {isMcpOnline === false && (
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono bg-[#EA4335]/15 text-[#FF7563] border border-[#EA4335]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF7563]" />
                  MCP Disconnected
                </span>
              )}
              {isMcpOnline === null && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/10 text-[#9AA0A6]">
                  Checking status...
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#9AA0A6] hidden sm:block">
              Visual element feedback tool streaming exact DOM selectors, positions, and notes directly to AI coding agents.
            </p>
          </div>
        </div>

        {/* Action Controls & Close */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            className={`p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors ${
              isRefreshing ? 'animate-spin' : ''
            }`}
            title="Refresh MCP Status"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={toggleAgentation}
            className="p-1.5 rounded-full hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] transition-colors"
            title="Close Agentation Studio"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 2. Three Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-sans text-xs">
        {/* Column 1: Visual Annotation Trigger */}
        <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#C58AF9]/15 text-[#C58AF9] border border-[#C58AF9]/30">
                Visual Inspection
              </span>
              <span className="text-[10px] font-mono text-[#9AA0A6]">Browser Overlay</span>
            </div>
            <h4 className="text-sm font-bold text-[#E3E3E3]">Annotate On-Screen Elements</h4>
            <p className="text-[11px] text-[#9AA0A6] mt-1.5 leading-relaxed">
              Click elements anywhere in SPHEREx Odyssey to pin bugs, layout adjustments, or styling feedback. The exact DOM tree path, bounding boxes, and CSS styles are captured automatically.
            </p>
          </div>

          <button
            onClick={handleLaunchAnnotation}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#C58AF9]/30 to-[#8AB4F8]/30 hover:from-[#C58AF9] hover:to-[#8AB4F8] text-[#E3E3E3] hover:text-[#131314] font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md group"
          >
            <MousePointerClick className="w-4 h-4 text-[#C58AF9] group-hover:text-[#131314] transition-colors" />
            <span>Launch Visual Annotation Mode</span>
          </button>
        </div>

        {/* Column 2: Agent MCP Integration */}
        <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#8AB4F8]/15 text-[#8AB4F8] border border-[#8AB4F8]/30">
                Model Context Protocol
              </span>
              <span className="text-[10px] font-mono text-[#9AA0A6]">Claude Code · Antigravity</span>
            </div>
            <h4 className="text-sm font-bold text-[#E3E3E3]">Connected MCP Tools</h4>
            <div className="mt-2 space-y-1.5 font-mono text-[11px] text-[#9AA0A6]">
              <div className="flex items-center gap-1.5 text-[#E3E3E3]">
                <Code2 className="w-3.5 h-3.5 text-[#8AB4F8]" />
                <span className="text-[#8AB4F8]">agentation_watch_annotations</span>
              </div>
              <p className="text-[10px] text-[#9AA0A6] pl-5 leading-tight">
                Streams annotations in hands-free continuous loop.
              </p>

              <div className="flex items-center gap-1.5 text-[#E3E3E3] pt-1">
                <Code2 className="w-3.5 h-3.5 text-[#81C995]" />
                <span className="text-[#81C995]">agentation_get_pending</span>
              </div>
              <p className="text-[10px] text-[#9AA0A6] pl-5 leading-tight">
                Inspects all open visual feedback items.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 p-2 rounded-xl bg-black/40 border border-white/10 font-mono text-[11px]">
            <div className="truncate text-[#9AA0A6]">
              <span className="text-[#8AB4F8]">$</span> npx agentation-mcp server
            </div>
            <button
              onClick={handleCopyCommand}
              className="p-1 rounded hover:bg-white/10 text-[#9AA0A6] hover:text-[#E3E3E3] shrink-0"
              title="Copy start command"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Column 3: Live Pending Annotations Feed */}
        <div className="p-3.5 rounded-2xl bg-white/[0.04] border border-white/10 flex flex-col justify-between gap-2.5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#81C995]/15 text-[#81C995] border border-[#81C995]/30">
                Pending Queue ({annotations.length})
              </span>
              {annotations.length > 0 && (
                <button
                  onClick={handleCopySummary}
                  className="text-[10px] font-medium text-[#8AB4F8] hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" />
                  {copiedSummary ? 'Copied!' : 'Copy for Agent'}
                </button>
              )}
            </div>
            <h4 className="text-sm font-bold text-[#E3E3E3]">Active Annotations</h4>

            <div className="mt-2 space-y-2 max-h-[110px] overflow-y-auto pr-1">
              {annotations.length === 0 ? (
                <div className="py-4 text-center text-[#9AA0A6] text-[11px]">
                  No pending annotations.
                  <br />
                  Click <strong className="text-[#E3E3E3]">Launch Visual Annotation</strong> to add your first note!
                </div>
              ) : (
                annotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="p-2 rounded-xl bg-black/30 border border-white/5 flex items-start justify-between gap-2 text-[11px]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-[#E3E3E3] truncate">
                        {ann.comment}
                      </div>
                      <div className="text-[10px] font-mono text-[#8AB4F8] truncate">
                        {ann.elementPath || ann.element}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleResolveAnnotation(ann.id)}
                        className="p-1 rounded hover:bg-[#81C995]/20 text-[#81C995]"
                        title="Mark as resolved"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteAnnotation(ann.id)}
                        className="p-1 rounded hover:bg-[#EA4335]/20 text-[#FF7563]"
                        title="Delete annotation"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex items-center justify-between text-[10px] text-[#9AA0A6] pt-1 border-t border-white/5 font-mono">
            <span>Storage: SQLite (~/.agentation/store.db)</span>
            <span>Sync: WebSocket & SSE</span>
          </div>
        </div>
      </div>
    </div>
  );
}
