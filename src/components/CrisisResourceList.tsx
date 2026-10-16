import { Phone } from "lucide-react";
import { CRISIS_RESOURCES, EMERGENCY_RESOURCES, type CrisisResource } from "@/lib/crisisResources";

function ResourceItem({ resource, urgent }: { resource: CrisisResource; urgent?: boolean }) {
  return (
    <li>
      <a
        href={`tel:${resource.number}`}
        className={`flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors hover:bg-surface-muted ${
          urgent ? "border-care/40" : "border-line"
        }`}
      >
        <Phone className="size-4 shrink-0 text-care" aria-hidden />
        <span className="flex-1">
          <span className="font-medium">{resource.name}</span>
          <span className="block text-sm text-ink-soft">{resource.description}</span>
        </span>
        <span className="font-serif text-xl tracking-wider text-care">{resource.number}</span>
      </a>
    </li>
  );
}

export function CrisisResourceList({ includeEmergency = true }: { includeEmergency?: boolean }) {
  return (
    <ul className="grid gap-2">
      {CRISIS_RESOURCES.map((r) => (
        <ResourceItem key={r.number} resource={r} />
      ))}
      {includeEmergency &&
        EMERGENCY_RESOURCES.map((r) => <ResourceItem key={r.number} resource={r} urgent />)}
    </ul>
  );
}
