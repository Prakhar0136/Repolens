// apps/web-dashboard/src/App.tsx
import { useState, useEffect } from 'react';
import { Search, DownloadCloud, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';

import type {
  Node,
  Edge,
} from '@xyflow/react';

export default function App() {
  // --- PART 1: THE APPLICATION MEMORY ---
  const [repoUrl, setRepoUrl] = useState('');
  const [repoId, setRepoId] = useState<string | null>(null);
  const [status, setStatus] = useState<'IDLE' | 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'>('IDLE');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Layout Canvas Nodes & Connections Hooks
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // --- PART 2: GRAPH DATA LOADER ---
  const loadGraphData = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/repo/${id}/graph`);
      const data = await response.json();

      const formattedNodes: Node[] = data.nodes.map((file: any, index: number) => {
        const row = Math.floor(index / 4);
        const col = index % 4;

        return {
          id: file.id,
          type: 'default',
          data: { label: file.name },
          position: { x: col * 250 + 50, y: row * 150 + 50 },
          style: {
            background: '#1e1b4b',
            color: '#60a5fa',
            border: '1px solid #3b82f6',
            borderRadius: '8px',
            padding: '10px',
            fontSize: '12px',
            fontWeight: '600',
            fontFamily: 'monospace',
            width: 180,
            textAlign: 'center',
          }
        };
      });

      const formattedEdges: Edge[] = data.edges.map((edge: any) => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        animated: true,
        style: { stroke: '#3b82f6', strokeWidth: 2 }
      }));

      setNodes(formattedNodes);
      setEdges(formattedEdges);
    } catch (error) {
      console.error('Failed to translate codebase map data:', error);
    }
  };

  // --- PART 3: REPETITIVE POLLING LOOP ---
  useEffect(() => {
    if (!repoId || status === 'COMPLETED' || status === 'FAILED') return;

    // Set up an automated recurring clock loop (Pings every 3 seconds)
    const intervalId = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/repo/${repoId}/status`);
        const data = await response.json();

        setStatus(data.status);

        // If the backend announces completion, load up the canvas map!
        if (data.status === 'COMPLETED') {
          clearInterval(intervalId);
          loadGraphData(repoId);
        } else if (data.status === 'FAILED') {
          clearInterval(intervalId);
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    }, 3000);

    // Safety cleanup rule: delete clock loop if component is unmounted
    return () => clearInterval(intervalId);
  }, [repoId, status]);

  // --- PART 4: SYSTEM INTAKE TRIGGER ---
  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoUrl.trim()) return;

    setIsLoading(true);
    setStatus('PENDING');
    setSearchResults([]);
    setNodes([]);
    setEdges([]);

    try {
      const response = await fetch('http://localhost:3001/api/repo/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl: repoUrl, name: 'My Codebase' })
      });
      const data = await response.json();
      if (data.repositoryId) {
        setRepoId(data.repositoryId);
      } else {
        setStatus('FAILED');
      }
    } catch (error) {
      setStatus('FAILED');
    }
    setIsLoading(false);
  };

  // --- PART 5: AI VECTOR SEARCH ---
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoId || status !== 'COMPLETED') return;

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/repo/${repoId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await response.json();
      setSearchResults(data.results || []);

      if (data.results && data.results.length > 0) {
        const matchingFileIds = data.results.map((r: any) => r.fileId || '');
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            const isMatch = matchingFileIds.includes(node.id);
            return {
              ...node,
              style: {
                ...node.style,
                border: isMatch ? '2px solid #10b981' : '1px solid #3b82f6',
                background: isMatch ? '#064e3b' : '#1e1b4b',
                boxShadow: isMatch ? '0 0 15px #10b981' : 'none'
              }
            };
          })
        );
      }
    } catch (error) {
      alert('Error searching vectors.');
    }
    setIsLoading(false);
  };

  // --- PART 6: THE RENDER VIEW ---
  return (
    <div className="flex h-screen bg-neutral-950 text-white font-sans overflow-hidden">

      {/* Control Configuration Bar */}
      <div className="w-1/3 p-6 border-r border-neutral-800 flex flex-col gap-6 bg-neutral-900 z-10">
        <h1 className="text-3xl font-bold text-blue-400">RepoLens</h1>

        {/* Input Pipeline Panel */}
        <form onSubmit={handleIngest} className="flex flex-col gap-2">
          <label className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">1. Ingest Repository</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm outline-none focus:border-blue-500"
              disabled={status === 'PENDING' || status === 'PROCESSING'}
            />
            <button
              type="submit"
              disabled={isLoading || status === 'PENDING' || status === 'PROCESSING'}
              className="bg-blue-600 hover:bg-blue-500 p-2 rounded-md font-semibold text-sm transition disabled:opacity-40"
            >
              {status === 'PENDING' || status === 'PROCESSING' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <DownloadCloud size={18} />
              )}
            </button>
          </div>
        </form>

        {/* Real-time Status Card Indicators */}
        {status !== 'IDLE' && (
          <div className={`p-3 rounded-lg border flex items-center gap-3 text-sm ${status === 'PENDING' && 'bg-amber-950/40 border-amber-800 text-amber-400' ||
            status === 'PROCESSING' && 'bg-blue-950/40 border-blue-800 text-blue-400' ||
            status === 'COMPLETED' && 'bg-emerald-950/40 border-emerald-800 text-emerald-400' ||
            'bg-rose-950/40 border-rose-800 text-rose-400'
            }`}>
            {(status === 'PENDING' || status === 'PROCESSING') && <Loader2 size={18} className="animate-spin" />}
            {status === 'COMPLETED' && <CheckCircle2 size={18} />}
            {status === 'FAILED' && <AlertCircle size={18} />}
            <span className="font-medium">
              {status === 'PENDING' && 'In Queue: Awaiting Background Thread...'}
              {status === 'PROCESSING' && 'Worker active: Cloning & Chunking Architecture...'}
              {status === 'COMPLETED' && 'Analysis Complete! Rendering Code Map.'}
              {status === 'FAILED' && 'Ingestion Failed. Verify public URL or code layout.'}
            </span>
          </div>
        )}

        {/* AI Query Trigger Input */}
        <form onSubmit={handleSearch} className="flex flex-col gap-2">
          <label className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">2. Semantic Search Engine</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={status === 'COMPLETED' ? "Where is the database initialized?" : "Awaiting processing completion..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm outline-none focus:border-blue-500 disabled:opacity-40"
              disabled={status !== 'COMPLETED'}
            />
            <button type="submit" disabled={isLoading || status !== 'COMPLETED'} className="bg-emerald-600 hover:bg-emerald-500 p-2 rounded-md font-semibold text-sm transition disabled:opacity-40">
              <Search size={18} />
            </button>
          </div>
        </form>

        {/* Results Stream Panel */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
          {searchResults.map((result, index) => (
            <div key={index} className="bg-neutral-800 p-4 rounded-lg border border-neutral-700 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-blue-400 font-mono font-medium truncate max-w-[70%]">{result.filePath}</span>
                <span className="text-[10px] bg-neutral-700 px-2 py-0.5 rounded text-neutral-300 font-mono">Lines {result.lineStart}-{result.lineEnd}</span>
              </div>
              <pre className="text-xs text-neutral-300 overflow-x-auto bg-neutral-850 p-2 rounded font-mono border border-neutral-700/50 max-h-32 line-clamp-4 whitespace-pre-wrap">
                {result.content}
              </pre>
              <div className="text-right mt-2">
                <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-900/30">
                  Match Score: {(1 - result.distance).toFixed(3)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Network Map Graph Window Canvas */}
      <div className="flex-1 h-full relative bg-neutral-950">
        {status === 'COMPLETED' && nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
          >
            <Background color="#334155" gap={16} size={1} />
            <Controls className="bg-neutral-800 border border-neutral-700 text-white rounded [&_button]:border-neutral-700" />
            <MiniMap position="bottom-right" style={{ background: '#171717' }} nodeColor="#1e1b4b" maskColor="rgba(0,0,0,0.4)" />
          </ReactFlow>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-neutral-500 gap-2">
            {(status === 'PENDING' || status === 'PROCESSING') && (
              <Loader2 size={32} className="animate-spin text-blue-500 mb-2" />
            )}
            <p className="text-sm font-medium">
              {status === 'IDLE' && 'No active repository map loaded.'}
              {status === 'PENDING' && 'Repository registered. Waiting for an open consumer thread...'}
              {status === 'PROCESSING' && 'AI engine actively transforming codebase architecture...'}
              {status === 'FAILED' && 'Canvas initialization halted due to failure pipeline.'}
            </p>
            <p className="text-xs text-neutral-600">
              {status === 'IDLE' && 'Submit a GitHub URL on the left to materialize your visual canvas.'}
              {(status === 'PENDING' || status === 'PROCESSING') && 'The visual graph canvas will draw automatically upon pipeline extraction.'}
              {status === 'FAILED' && 'Check server logs to diagnose dependency edge anomalies.'}
            </p>
          </div>
        )}
      </div>

    </div>
  );
}