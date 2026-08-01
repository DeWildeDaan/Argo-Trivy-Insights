/**
 * Minimal typings for the bits of the Argo CD extensions API we use.
 * Argo CD does not publish types for extensions, so we declare our own.
 */

export interface Application {
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  status?: Record<string, unknown>;
}

export interface ResourceNode {
  group?: string;
  version?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  uid?: string;
}

export interface ApplicationTree {
  nodes?: ResourceNode[];
}

/** Props passed to a component registered via registerAppViewExtension. */
export interface AppViewProps {
  application: Application;
  tree: ApplicationTree;
}

export interface ExtensionsAPI {
  registerAppViewExtension(
    component: React.ComponentType<AppViewProps>,
    title: string,
    icon: string,
    shouldDisplay?: (app: Application) => boolean
  ): void;
}

declare global {
  interface Window {
    extensionsAPI: ExtensionsAPI;
  }
}
