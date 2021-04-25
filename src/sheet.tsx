import * as React from 'react';
import * as ReactDOM from 'react-dom';

import {
  animate,
  useMotionValue,
  AnimatePresence,
  PanInfo,
} from 'framer-motion';

import { SheetContextType, SheetProps } from './types';
import { getClosest, inDescendingOrder, useWindowHeight } from './utils';
import { SheetContext } from './context';
import { useModalEffect } from './hooks';
import styles from './styles';

const Sheet = React.forwardRef<any, SheetProps>(
  (
    {
      children,
      isOpen,
      onClose,
      onOpenStart,
      onOpenEnd,
      onCloseStart,
      onCloseEnd,
      onSnap,
      snapPoints,
      initialSnap = 0,
      rootId,
      springConfig = { stiffness: 300, damping: 30, mass: 0.2 },
      disableDrag = false,
      ssr = false,
      ...rest
    },
    ref
  ) => {
    const [mounted, setMounted] = React.useState(false);
    const sheetRef = React.useRef<any>(null);
    const callbacks = React.useRef({ onOpenStart, onOpenEnd, onCloseStart, onCloseEnd }); // prettier-ignore
    const indicatorRotation = useMotionValue(0);
    const windowHeight = useWindowHeight();
    const y = useMotionValue(windowHeight);
    const pointerEvents = isOpen ? 'auto' : 'none';

    if (snapPoints) {
      // convert negative / percentage snap points to absolute values
      snapPoints = snapPoints.map(point => {
        if (point > 0 && point <= 1) return point * windowHeight; // percentage values e.g. between 0.0 and 1.0
        return point < 0 ? windowHeight + point : point; // negative values
      });

      // TODO: snapPoints need to be in descending order right (ignore if ssr = windowHeight = 0)?
      console.assert(
        inDescendingOrder(snapPoints) || windowHeight === 0,
        `Snap points need to be in descending order got: [${snapPoints}]`
      );
    }

    const handleDrag = React.useCallback((_, { delta }: PanInfo) => {
      // Update drag indicator rotation based on drag velocity
      const velocity = y.getVelocity();
      if (velocity > 0) indicatorRotation.set(10);
      if (velocity < 0) indicatorRotation.set(-10);

      // Make sure user cannot drag beyond the top of the sheet
      y.set(Math.max(y.get() + delta.y, 0));
    }, []); // eslint-disable-line

    const handleDragEnd = React.useCallback(
      (_, { velocity }: PanInfo) => {
        if (velocity.y > 500) {
          // User flicked the sheet down
          onClose();
        } else {
          const sheetEl = sheetRef.current as HTMLDivElement;
          const contentHeight = sheetEl.getBoundingClientRect().height;
          const snapTo = snapPoints
            ? getClosest(snapPoints.map(p => contentHeight - p), y.get()) // prettier-ignore
            : y.get() / contentHeight > 0.6 // Close if dragged over 60%
            ? contentHeight
            : 0;

          // Update the spring value so that the sheet is animated to the snap point
          animate(y, snapTo, { type: 'spring', ...springConfig });

          if (snapPoints && onSnap) {
            const snapValue = Math.abs(Math.round(snapPoints[0] - snapTo));
            const snapIndex = snapPoints.indexOf(snapValue);
            onSnap(snapIndex);
          }

          if (snapTo >= contentHeight) onClose();
        }

        // Reset indicator rotation after dragging
        indicatorRotation.set(0);
      },
      [onClose, onSnap] // eslint-disable-line
    );

    // Keep the callback fns up-to-date so that they can be accessed inside
    // the effect without including them to the dependencies array
    React.useEffect(() => {
      callbacks.current = { onOpenStart, onOpenEnd, onCloseStart, onCloseEnd };
    });

    React.useEffect(() => {
      setMounted(true);
    }, []);

    // Trigger onSnap callback when sheet is opened or closed
    React.useEffect(() => {
      if (!snapPoints || !onSnap || !mounted) return;
      const snapIndex = isOpen ? initialSnap : snapPoints.length - 1;
      onSnap(snapIndex);
    }, [isOpen]);

    React.useImperativeHandle(ref, () => ({
      snapTo: (snapIndex: number) => {
        if (snapPoints && snapPoints[snapIndex] !== undefined) {
          const sheetEl = sheetRef.current as HTMLDivElement;
          const contentHeight = sheetEl.getBoundingClientRect().height;
          const snapTo = contentHeight - snapPoints[snapIndex];

          animate(y, snapTo, { type: 'spring', ...springConfig });
          if (onSnap) onSnap(snapIndex);
          if (snapTo >= contentHeight) onClose();
        }
      },
    }));

    useModalEffect(isOpen, rootId);

    const dragProps = disableDrag
      ? ({} as any)
      : {
          drag: 'y' as const,
          dragElastic: 0,
          dragConstraints: { top: 0, bottom: 0 },
          dragMomentum: false,
          onDrag: handleDrag,
          onDragEnd: handleDragEnd,
        };

    const context: SheetContextType = {
      y,
      sheetRef,
      isOpen,
      initialSnap,
      snapPoints,
      indicatorRotation,
      callbacks,
      dragProps,
      windowHeight,
    };

    const wrapperProps = {
      ...rest,
      ref,
      style: {
        ...styles.wrapper,
        pointerEvents,
      } as any,
    };

    const sheet = (
      <SheetContext.Provider value={context}>
        <AnimatePresence>
          {/* NOTE: AnimatePresence requires us to set keys to children */}
          {isOpen
            ? React.Children.map(children, (child: any, i) =>
                React.cloneElement(child, { key: `sheet-child-${i}` })
              )
            : null}
        </AnimatePresence>
      </SheetContext.Provider>
    );

    if (ssr) return sheet;

    return mounted ? (
      ReactDOM.createPortal(sheet, document.body)
    ) : (
      // NOTE: return the wrapper div so that SSR frameworks don't get confused
      // with the HTML structure ("Expected server HTML to contain a matching <div>...")
      <div {...wrapperProps} />
    );
  }
);

export default Sheet;
