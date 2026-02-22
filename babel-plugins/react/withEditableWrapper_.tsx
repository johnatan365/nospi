/* eslint-disable */

import {
  createContext,
  PropsWithChildren,
  useCallback,
  useEffect,
  useState,
} from "react";
import { ElementTypes } from "./EditableElement_";
import { Platform } from "react-native";

type ElementProps = {
  type: ElementTypes;
  sourceLocation: string;
  attributes: any;
  id: string;
};

type EditableContextType = {
  onElementClick: (props: ElementProps) => void;
  editModeEnabled: boolean;
  attributes: Record<string, any>;
  selected: string | undefined;
  setSelected: (hovered: string | undefined) => void;
  hovered: string | undefined;
  pushHovered: (hovered: string) => void;
  popHovered: (hovered: string) => void;
};

export const EditableContext = createContext<EditableContextType>({} as any);

const EditablePage = (props: PropsWithChildren) => {
  const { children } = props;
  const [haveBooted, setHaveBooted] = useState<boolean>(false);
  const [editModeEnabled, setEditModeEnabled] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [hoveredStack, setHoveredStack] = useState<string[]>([]);
  const [origin, setOrigin] = useState<string | null>(null);
  const [overwrittenProps, setOvewrittenProps] = useState<Record<string, {}>>(
    {}
  );

  useEffect(() => {
    if (!haveBooted) {
      setHaveBooted(true);
      window.addEventListener("message", (event) => {
        const { type, data } = event.data ?? {};
        if (event.origin && !origin) {
          setOrigin(event.origin);
        }
        switch (type) {
          case "element_editor_enable": {
            setEditModeEnabled(true);
            setOvewrittenProps({}); // Clean slate — no stale overrides from previous session
            break;
          }
          case "element_editor_disable": {
            setEditModeEnabled(false);
            setOvewrittenProps({}); // Clear all overrides when leaving edit mode
            break;
          }
          case "override_props": {
            setOvewrittenProps((overwrittenProps) => {
              const updated = { ...overwrittenProps };
              // Always store by element id (reliable fallback)
              updated[data.id] = {
                ...(updated[data.id] ?? {}),
                ...data.props,
              };
              // Also store by id:oldUrl for URL-specific matching in lists
              if (data.oldUrl) {
                const urlKey = `${data.id}:${data.oldUrl}`;
                updated[urlKey] = {
                  ...(updated[urlKey] ?? {}),
                  ...data.props,
                };
              }
              return updated;
            });
            break;
          }
          case "clear_overrides": {
            setOvewrittenProps((overwrittenProps) => {
              const updated = { ...overwrittenProps };
              const elementId = data.id;
              // Remove all keys that match this element (plain id and id:* url-specific)
              for (const key of Object.keys(updated)) {
                if (key === elementId || key.startsWith(`${elementId}:`)) {
                  delete updated[key];
                }
              }
              return updated;
            });
            break;
          }
          case "get_selected_rect": {
            try {
              const el = document.querySelector('[data-natively-selected="true"]');
              if (el && event.origin) {
                const r = el.getBoundingClientRect();
                window.parent.postMessage({
                  type: 'element_rect',
                  rect: { top: r.top, left: r.left, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
                }, event.origin);
              }
            } catch (e) {}
            break;
          }
        }

        setOrigin(event.origin);
      });
    }
  }, [haveBooted]);

  const postMessageToParent = useCallback(
    (message: any) => {
      if (origin && window.parent) {
        window.parent.postMessage(message, origin);
      }
    },
    [origin]
  );

  const onElementClick = (props: ElementProps) => {
    setSelected(props.id);
    postMessageToParent({ type: "element_clicked", element: props });
  };

  const hovered = hoveredStack[hoveredStack.length - 1];

  const pushHovered = (hovered: string) => {
    setHoveredStack((hoveredStack) => [
      hovered,
      ...hoveredStack.filter((v) => v !== hovered),
    ]);
  };

  const popHovered = (hovered: string) => {
    setHoveredStack((hoveredStack) =>
      hoveredStack.filter((v) => v !== hovered)
    );
  };
  return (
    <EditableContext.Provider
      value={{
        attributes: overwrittenProps,
        onElementClick,
        editModeEnabled,
        pushHovered,
        popHovered,
        selected,
        setSelected,
        hovered,
      }}
    >
      {children}
    </EditableContext.Provider>
  );
};

export default function withEditableWrapper_<P extends PropsWithChildren>(
  Comp: React.ComponentType<P>
) {
  return function Wrapped(props: P) {
    // If we are not running in the web the windows will causes
    // issues hence editable mode is not enabled.
    if (Platform.OS !== "web") {
      return <Comp {...props}></Comp>;
    }

    return (
      <EditablePage>
        <Comp {...props}></Comp>
      </EditablePage>
    );
  };
}
