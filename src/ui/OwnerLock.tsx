import { useState } from 'react';
import { Settings } from 'lucide-react';
import OwnerLoginModal from './OwnerLoginModal';
import styles from './OwnerLock.module.css';

export default function OwnerLock({ isOwner, authError, isAuthLoading, onAuthenticate, onOpen }: any) {
  const [showLogin, setShowLogin] = useState(false);

  function handleGearClick() {
    if (isOwner) {
      onOpen();
    } else {
      setShowLogin(true);
    }
  }

  function handleAuthenticate(password: string) {
    onAuthenticate(password);
    // The modal stays mounted while the parent decides whether the password
    // was valid. When isOwner flips true, the parent unmounts us; otherwise
    // authError surfaces inside the modal.
  }

  return (
    <div className={styles.wrap}>
      <button
        className={styles.gear}
        onClick={handleGearClick}
        aria-label={isOwner ? 'Open settings' : 'Owner settings'}
        title={isOwner ? 'Settings' : 'Owner settings'}
      >
        <Settings size={16} />
      </button>

      {showLogin && !isOwner && (
        <OwnerLoginModal
          authError={authError}
          isAuthLoading={isAuthLoading}
          onAuthenticate={handleAuthenticate}
          onClose={() => setShowLogin(false)}
        />
      )}
    </div>
  );
}
