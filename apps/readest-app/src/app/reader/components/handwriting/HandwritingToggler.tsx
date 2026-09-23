import React from 'react';
import clsx from 'clsx';
import { LuPenTool } from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useHandwritingStore } from '@/store/handwritingStore';

export const HandwritingToggler: React.FC<{ bookKey: string }> = ({ bookKey }) => {
  const _ = useTranslation();
  const iconSize18 = useResponsiveSize(18);
  const { activeBookKey, toggleHandwriting } = useHandwritingStore();
  const isActive = activeBookKey === bookKey;

  return (
    <button
      title={isActive ? _('Close Handwriting') : _('Handwriting Notes')}
      aria-label={_('Handwriting Notes')}
      className={clsx(
        'btn btn-ghost h-8 min-h-8 w-8 p-0 transition-colors',
        isActive && 'bg-primary/20 text-primary font-bold',
      )}
      onClick={() => toggleHandwriting(bookKey)}
    >
      <LuPenTool size={iconSize18} className={isActive ? 'text-primary' : 'text-base-content'} />
    </button>
  );
};
export default HandwritingToggler;
