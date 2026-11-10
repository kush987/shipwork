import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/ui';

export function NotFoundPage() {
  return (
    <div className="page">
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="This page doesn't exist or has moved."
        action={
          <Link to="/" className="btn btn-primary btn-md">
            Back to dashboard
          </Link>
        }
      />
    </div>
  );
}
