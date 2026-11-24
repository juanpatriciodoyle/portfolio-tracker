import { UserRound } from 'lucide-react';
import { useProfile } from '../hooks/useProfile';
import { useTranslation } from '../i18n/useTranslation';
import { initialsOf } from '../lib/initials';

interface ProfileAvatarProps {
  /** Opens the profile and living phases. */
  onOpen: () => void;
}

/** The way into the profile: the person's initials once a name is saved, the generic icon until then. */
export default function ProfileAvatar({ onOpen }: ProfileAvatarProps) {
  const { profile } = useProfile();
  const { t } = useTranslation();
  const initials = initialsOf(profile?.fullName);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${initials ? 'profile-avatar' : 'profile-entry-button'} profile-entry`}
      aria-label={t('header.profileAndPhases')}
      title={t('header.profile')}
    >
      <span className="profile-entry__mark" aria-hidden="true">
        {initials ? initials : <UserRound size={16} />}
      </span>
      {/* The word sits beside the mark on wide screens; on a phone only the mark stays, and the button keeps its name. */}
      <span className="profile-entry__label" aria-hidden="true">
        {t('header.profile')}
      </span>
    </button>
  );
}
