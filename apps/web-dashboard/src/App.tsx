// apps/web-dashboard/src/App.tsx

import { useState } from 'react';
import { Search, DownloadCloud } from 'lucide-react';

export default function App() {
  // --- PART 1: THE MEMORY (STATE) ---
  const [repoUrl, setRepoUrl] = useState('');
  const [repoId, setRepoId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // --- PART 2: THE INGESTION ACTION ---
  const handleIngest = async () => {
    setIsLoading(true);

    try {
      const response = await fetch(
        'http://localhost:3001/api/repo/ingest',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            githubUrl: repoUrl,
            name: 'My Codebase',
          }),
        }
      );

      const data = await response.json();

      if (data.repositoryId) {
        setRepoId(data.repositoryId);
        alert(
          'Success! The background worker is cloning and analyzing the code now.'
        );
      }
    } catch (error) {
      console.error(error);
      alert(
        'Error: Could not connect to the API Server. Is it running?'
      );
    } finally {
      setIsLoading(false);
    }
  };

  // --- PART 3: THE SEARCH ACTION ---
  const handleSearch = async () => {
    if (!repoId) {
      alert('Please submit a GitHub repository first!');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch(
        `http://localhost:3001/api/repo/${repoId}/search`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: searchQuery,
          }),
        }
      );

      const data = await response.json();

      setSearchResults(data.results || []);
    } catch (error) {
      console.error(error);
      alert('Error searching the database.');
    } finally {
      setIsLoading(false);
    }
  };

  // --- PART 4: THE VISUAL HTML ---
  return (
    <div className="flex h-screen bg-neutral-950 text-white font-sans">
      {/* Sidebar Control Panel */}
      <div className="w-1/3 p-6 border-r border-neutral-800 flex flex-col gap-8 bg-neutral-900">
        <h1 className="text-3xl font-bold text-blue-400">
          RepoLens
        </h1>

        {/* Form 1: GitHub URL Intake */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleIngest();
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-sm text-neutral-400">
            1. Ingest a Repository
          </label>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="https://github.com/user/repo"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md p-2 outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-500 p-2 rounded-md font-semibold flex items-center justify-center"
            >
              <DownloadCloud size={20} />
            </button>
          </div>
        </form>

        {/* Form 2: AI Semantic Search */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSearch();
          }}
          className="flex flex-col gap-3"
        >
          <label className="text-sm text-neutral-400">
            2. Ask the AI
          </label>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="e.g. Where does authentication happen?"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 bg-neutral-800 border border-neutral-700 rounded-md p-2 outline-none focus:border-blue-500"
            />

            <button
              type="submit"
              disabled={isLoading || !repoId}
              className="bg-emerald-600 hover:bg-emerald-500 p-2 rounded-md font-semibold flex items-center justify-center disabled:opacity-50"
            >
              <Search size={20} />
            </button>
          </div>
        </form>

        {/* Display Search Results */}
        <div className="flex-1 overflow-y-auto flex flex-col gap-4 mt-4">
          {searchResults.map((result, index) => (
            <div
              key={index}
              className="bg-neutral-800 p-4 rounded-md border border-neutral-700"
            >
              <p className="text-xs text-blue-400 font-mono mb-2">
                {result.filePath} (Lines {result.lineStart}-
                {result.lineEnd})
              </p>

              <p className="text-sm text-neutral-300 line-clamp-4">
                {result.content}
              </p>

              <p className="text-xs text-emerald-400 mt-2">
                Relevance:{' '}
                {(1 - result.distance).toFixed(3)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex items-center justify-center bg-neutral-950">
        <p className="text-neutral-500">
          The Visual Node Graph will go here in the next step!
        </p>
      </div>
    </div>
  );
}