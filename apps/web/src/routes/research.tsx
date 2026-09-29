import { Card, PageHeader } from '../components/ui.tsx';

export function ResearchPage() {
  return (
    <>
      <PageHeader
        title="Research"
        subtitle="Paste a contract address, get a source-backed report. Arrives in V0b."
      />
      <Card title="New report">
        <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
          <input
            disabled
            placeholder="Contract address"
            className="flex-1 rounded-md border border-border bg-canvas px-3 py-2 font-mono text-sm placeholder:text-muted disabled:opacity-60"
          />
          <button
            type="submit"
            disabled
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas disabled:opacity-40"
          >
            Research
          </button>
        </form>
      </Card>
    </>
  );
}
