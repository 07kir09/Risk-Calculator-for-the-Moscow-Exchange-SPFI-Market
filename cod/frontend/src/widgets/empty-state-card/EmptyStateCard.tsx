type EmptyStateCardProps = {
  message: string;
};

export function EmptyStateCard({ message }: EmptyStateCardProps) {
  return (
    <div className="panel panel-padded-16">
      <p className="small-muted flow-0">{message}</p>
    </div>
  );
}
