import Link from "next/link";

const TOPIC_STYLES: Record<string, string> = {
  environment: "bg-primary/15 text-primary",
  education: "bg-accent/15 text-accent",
  technology: "bg-accent/15 text-accent",
  health: "bg-primary/15 text-primary",
  economy: "bg-secondary/25 text-text",
  society: "bg-secondary/25 text-text",
  culture: "bg-accent/15 text-accent",
  crime: "bg-primary/15 text-primary",
  government: "bg-secondary/25 text-text",
};
const DEFAULT_TOPIC_STYLE = "bg-accent/15 text-accent";

// Shared by the Topics browser and the Topic quiz tab, which show the same
// grid of topic cards but link them at different destinations.
export default function TopicCards({
  topics,
  hrefPrefix,
  countLabel = (count) => `${count} ${count === 1 ? "word" : "words"}`,
}: {
  topics: [string, number][];
  hrefPrefix: string;
  countLabel?: (count: number) => string;
}) {
  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map(([topic, count]) => (
        <li key={topic}>
          <Link
            href={`${hrefPrefix}${encodeURIComponent(topic)}`}
            className="flex h-full flex-col gap-3 rounded-xl border border-text/10 bg-background p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span
              className={`self-start rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                TOPIC_STYLES[topic] ?? DEFAULT_TOPIC_STYLE
              }`}
            >
              {topic}
            </span>
            <span className="text-lg font-semibold capitalize text-text">{topic}</span>
            <span className="mt-auto text-sm text-text/60">{countLabel(count)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
