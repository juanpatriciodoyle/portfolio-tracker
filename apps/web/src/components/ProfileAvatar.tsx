import { UserRound } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { initialsOf } from '../lib/initials';

interface ProfileAvatarProps {
  /** Opens the profile and living phases. */
  onOpen: () => void;
}

/** The way into the profile: the person's initials once a name is saved, the generic icon until then. */
export default function ProfileAvatar({ onOpen }: ProfileAvatarProps) {
  const { profile } = useProfile();
  const initials = initialsOf(profile?.fullName);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={initials ? 'profile-avatar' : 'profile-entry-button'}
      aria-label="Profile and living phases"
      title="Profile"
    >
      {initials ? <span aria-hidden="true">{initials}</span> : <UserRound size={16} />}
    </button>
  );
}
