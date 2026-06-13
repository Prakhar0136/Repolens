// apps/web-dashboard/src/App.tsx
import { useState, useEffect } from 'react';
import { Search, DownloadCloud } from 'lucide-react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export default function App() {
  // --- PART 1: THE MEMORY STATE ---
  const [repoUrl, setRepoUrl] = useState('');
  const [repoId, setRepoId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // React Flow specialized states for managing nodes and connections
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  // --- PART 2: GRAPH DATA TRANSLATOR ---
  const loadGraphData = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/repo/${id}/graph`);
      const data = await response.json();

      // Convert raw database rows into visual coordinates React Flow understands
      const formattedNodes: Node[] = data.nodes.map((file: any, index: number) => {
        // Arrange items in a circular layout or row configuration so they don't pile up in one spot
        const row = Math.floor(index / 4);
        const col = index % 4;

        return {
          id: file.id,
          type: 'default',
          data: { label: file.name },
          position: { x: col * 250 + 50, y: row * 150 + 50 },
          style: {
            background: '#1e1b4b', // Deep indigo background
            color: '#60a5fa',      // Blue text
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

      // Convert database dependencies into directional paths
      const formattedEdges: Edge[] = data.edges.map((edge: any) => ({
        id: edge.id,
        source: edge.sourceId,
        target: edge.targetId,
        animated: true, // Make data paths look active
        style: { stroke: '#3b82f6', strokeWidth: 2 }
      }));

      setNodes(formattedNodes);
      setEdges(formattedEdges);
    } catch (error) {
      console.error('Failed to translate codebase map data:', error);
    }
  };

  // Automatically refresh the canvas layout when a repoId becomes active
  useEffect(() => {
    if (repoId) {
      loadGraphData(repoId);
    }
  }, [repoId]);

  // --- PART 3: REPO INTAKE ---
  const handleIngest = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const response = await fetch('http://localhost:3001/api/repo/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubUrl: repoUrl, name: 'My Codebase' })
      });
      const data = await response.json();
      if (data.repositoryId) {
        setRepoId(data.repositoryId);
      }
    } catch (error) {
      alert('Error: Could not connect to the API Server.');
    }
    setIsLoading(false);
  };

  // --- PART 4: AI SEMANTIC SEARCH ---
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repoId) return alert('Please submit a GitHub repository first!');
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/repo/${repoId}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await response.json();
      setSearchResults(data.results || []);

      // Highlight matching components directly on the node map graph
      if (data.results && data.results.length > 0) {
        const matchingFileIds = data.results.map((r: any) => r.fileId || '');
        setNodes((prevNodes) =>
          prevNodes.map((node) => {
            const isMatch = matchingFileIds.includes(node.id);
            return {
              ...node,
              style: {
                ...node.style,
                border: isMatch ? '2px solid #10b981' : '1px solid #3b82f6', // Emerald highlight
                background: isMatch ? '#064e3b' : '#1e1b4b',
                boxShadow: isMatch ? '0 0 15px #10b981' : 'none'
              }
            };
          })
        );
      }
    } catch (error) {
      alert('Error searching the database.');
    }
    setIsLoading(false);
  };

  // --- PART 5: THE VIEW ---
  return (
    <div className="flex h-screen bg-neutral-950 text-white font-sans overflow-hidden">

      {/* Sidebar Controls */}
      <div className="w-1/3 p-6 border-r border-neutral-800 flex flex-col gap-6 bg-neutral-900 z-10">
        <h1 className="text-3xl font-bold text-blue-400">RepoLens</h1>

        <form onSubmit={handleIngest} className="flex flex-col gap-2">
          <label className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">1. Ingest Repository</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={isLoading} className="bg-blue-600 hover:bg-blue-500 p-2 rounded-md font-semibold text-sm transition">
              <DownloadCloud size={18} />
            </button>
          </div>
        </form>

        <form onSubmit={handleSearch} className="flex flex-col gap-2">
          <label className="text-xs text-neutral-400 font-semibold uppercase tracking-wider">2. Semantic Search Engine</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Where is the database initialized?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md p-2 text-sm outline-none focus:border-blue-500"
            />
            <button type="submit" disabled={isLoading || !repoId} className="bg-emerald-600 hover:bg-emerald-500 p-2 rounded-md font-semibold text-sm transition disabled:opacity-40">
              <Search size={18} />
            </button>
          </div>
        </form>

        {/* Dynamic Context Snippets */}
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

      {/* Main Content Area - Interactive Network Canvas */}
      <div className="flex-1 h-full relative bg-neutral-950">
        {nodes.length > 0 ? (
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
            <div className="w-12 h-12 rounded-full border-2 border-neutral-800 border-t-blue-500 animate-spin mb-2 hidden" id="spinner"></div>
            <p className="text-sm font-medium">No active repository map loaded.</p>
            <p className="text-xs text-neutral-600">Submit a GitHub URL on the left to materialize your visual canvas.</p>
          </div>
        )}
      </div>

    </div>
  );
}