// Known app/framework Dataverse calls that the model-driven app makes on its
// own (loading metadata, settings, Copilot, Customer Service features). They
// are hidden by the default "Data activity" filter but never discarded.
//
// The lists come from a recorded Case open/edit/save on a Customer Service
// trial (2026-10-09), where about 2 of 148 Dataverse requests were the user's
// own changes. Anything not listed stays visible, including custom actions.
import type { TraceOperation } from '../models/TraceEvent';
import type { DataverseKind } from './parser';

/** Unbound functions and actions called by the app shell and Customer Service features. */
const BACKGROUND_OPERATIONS = new Set([
  'GetClientMetadata',
  'GetOrgDbOrgSetting',
  'GetOrCreateSharedWorkspace',
  'GetRecentItems',
  'UpdateRecentItems',
  'RetrieveSetting',
  'RetrieveMaskedAttributesForEntity',
  'msdyn_CheckFeatureStatus',
  'msdyn_UCIClientAuth',
  'msdyn_RetrieveTenantSettings',
  'msdyn_RetrieveSearchProviders',
  'msdyn_GetLicenseAndCapacityDetails',
  'msdyn_GetTenantCapacityDetail',
  'msdyn_EvaluateUserEntitlement',
  'msdyn_getAppConfigByAgent',
  'msdyn_getAppConfigByContext',
  'msdyn_GetInboxConfiguration',
  'msdyn_GetInboxRecords',
  'msdyn_GetInboxUnreadData',
  'msdyn_GetProductivityPaneToolsConfiguration',
  'msdyn_ReportToMonitoringHub',
  'msdyn_InvokeIntelligenceAction',
  'msdyn_DiscoverCustomerServiceSummaryInsight',
  // Seen in a later Edge test on the same trial: opening a Case marks it read
  // and the app reads Customer Service environment variables.
  'msdyn_UpdateReadStatus',
  'msdyn_RetrieveEnvironmentVariableValueForCS',
]);

/** Prefixes of background functions/actions (Customer Service channel connection). */
const BACKGROUND_OPERATION_PREFIXES = ['CCaaS_'];

/** Configuration tables the app reads while loading forms and panes. */
const BACKGROUND_TABLES = new Set([
  'organizations',
  'organizationsettings',
  'webresourceset',
  'languagelocale',
  'appmodules',
  'solutions',
  'roles',
  'environmentvariabledefinitions',
  'aiskillconfigs',
  'aiinsightcards',
  'msdyn_appconfigurations',
  'msdyn_applicationtabtemplates',
  'msdyn_sessiontemplates',
  'msdyn_notificationtemplates',
  'msdyn_paneconfigurations',
  'msdyn_panetoolconfigurations',
  'msdyn_personasecurityrolemappings',
  'msdyn_customcontrolextendedsettingses',
  'msdyn_nextbestactionsconfigs',
  'msdyn_nextactions',
  'msdyn_msteamssettingsv2',
  'msdyn_voicechannelorganizationsettings',
  'msdyn_evaluationglobalconfigs',
  'msdyn_suggestionssettings',
  'msdyn_usersettings',
  'msdyn_tours',
  'msdyn_timelinepins',
  'msdyn_bookingsetupmetadatas',
  'msdyn_rtestructuredtemplateconfigs',
  'msdyn_intententities',
  'msdyn_entityattributepredictionrules',
  'msdyn_caseaipredictions',
  'msdyn_productivityagentscripts',
  'msdyn_productivityagentscriptsteps',
  'msdyn_productivitymacroactiontemplates',
  'msdyn_productivitymacroconnectors',
]);

const COPILOT = /copilot/i;

export function isBackgroundCall(kind: DataverseKind, resource: string, operation: TraceOperation): boolean {
  switch (kind) {
    case 'metadata':
      return true;
    case 'batch':
      return false;
    case 'function':
    case 'action':
      return (
        BACKGROUND_OPERATIONS.has(resource) ||
        BACKGROUND_OPERATION_PREFIXES.some((p) => resource.startsWith(p)) ||
        COPILOT.test(resource)
      );
    case 'table': {
      if (COPILOT.test(resource)) return true;
      const isRead = operation === 'Retrieve' || operation === 'RetrieveMultiple';
      return isRead && BACKGROUND_TABLES.has(resource);
    }
  }
}
