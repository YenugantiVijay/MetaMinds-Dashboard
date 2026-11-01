export interface UserAvatarProps {
  user: { photoUrl?: string | null; name: string };
  className?: string;
}

export function UserAvatar({ user, className = "" }: UserAvatarProps) {
  const fallback = "/demo-avatar.svg";
  return (
    <img
      className={`user-avatar ${className}`}
      src={user.photoUrl || fallback}
      alt={`${user.name} profile`}
      onError={(event) => {
        if (event.currentTarget.src !== new URL(fallback, window.location.href).href) {
          event.currentTarget.src = fallback;
        }
      }}
    />
  );
}
