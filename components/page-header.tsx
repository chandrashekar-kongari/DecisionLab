type PageHeaderProps = {
  breadcrumb: string;
  title: string;
  description?: string;
};

export function PageHeader({ breadcrumb, title, description }: PageHeaderProps) {
  return (
    <header className="mb-8">
      <p className="text-2xs font-medium text-muted-foreground">{breadcrumb}</p>
      <h1 className="mt-1 text-2xl font-medium tracking-tight text-foreground">
        {title}
      </h1>
      {description ? (
        <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">{description}</p>
      ) : null}
    </header>
  );
}
