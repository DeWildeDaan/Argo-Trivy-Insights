/**
 * Minimal typings for the bits of the Argo CD extensions API we use.
 * Argo CD does not publish types for extensions, so we declare our own.
 */

export interface ResourceNode {
  group?: string;
  version?: string;
  kind?: string;
  name?: string;
  namespace?: string;
  uid?: string;
  // Used to skip re-fetching a resource's manifest on refresh when it hasn't
  // actually changed since the last load - see `fetchManifest` in api.ts.
  resourceVersion?: string;
}

export interface Application {
  metadata?: {
    name?: string;
    namespace?: string;
    labels?: Record<string, string>;
    annotations?: Record<string, string>;
  };
  spec?: Record<string, unknown>;
  // Note: `status.resources` (if present) is only the flat list of direct
  // sync/diff targets - it does NOT include resources discovered by walking
  // ownerReferences (ReplicaSets, Pods, or orphaned custom resources like
  // Trivy Operator reports attached to them). Use the resource-tree endpoint
  // (`fetchResourceTree` in api.ts) to get the same node graph the per-app
  // extension receives via its `tree` prop.
  status?: Record<string, unknown>;
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
  registerSystemLevelExtension(
    component: React.ComponentType<{}>,
    title: string,
    path: string,
    icon: string
  ): void;
}

declare global {
  interface Window {
    extensionsAPI: ExtensionsAPI;
  }
}
