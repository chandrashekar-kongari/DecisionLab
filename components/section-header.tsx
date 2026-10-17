type SectionHeaderProps = {
  title: string;
  description?: string;
};

export function SectionHeader({ title, description }: SectionHeaderProps) {
  return (
    <div className="mb-3">
      <h2 className="text-lg font-medium tracking-tight text-foreground">{title}</h2>
      {description ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
