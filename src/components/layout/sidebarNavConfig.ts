 import { NavigationService } from '@/services/navigation.service';
 
 export const primaryNav = NavigationService.getPrimaryNav();
 export const sidebarGroups = NavigationService.getGroups();
 
 // Backward compatibility
 export const salesNav = sidebarGroups[0].items;
 export const automationNav = sidebarGroups[1].items;
 export const communicationNav = automationNav;
 export const analyticsNav = sidebarGroups[2].items;
 export const connectionsNav = sidebarGroups[3].items;
 export const systemNav = sidebarGroups[4].items;
 export const inDevelopmentNav = sidebarGroups[5].items;
 export const advancedNav = NavigationService.getAdvancedNav();
