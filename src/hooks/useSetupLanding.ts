/* eslint-disable @typescript-eslint/no-explicit-any -- TODO: remove as types are tightened */
import { useState, useCallback } from 'react';
import type { SetupLandingResult } from '../ui/SetupLanding';
import { buildRecipeSavedView } from '../core/setupRecipes';

type OwnerConfig = Record<string, any>;

interface SavedViewsHandle {
  saveView: (name: string, filters: Record<string, unknown>, opts?: { view?: string | null; groupBy?: unknown }) => unknown;
}

export interface UseSetupLandingParams {
  showSetupLanding?: boolean;
  setupCompleted: boolean;
  updateConfig: (updater: OwnerConfig | ((prev: OwnerConfig) => OwnerConfig)) => void;
  closeConfig: () => void;
  savedViews: SavedViewsHandle;
  weekStartDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface UseSetupLandingReturn {
  setupDismissed: boolean;
  shouldShowSetup: boolean;
  handleSetupSkip: () => void;
  handleReopenSetup: () => void;
  handleSetupFinish: (result: SetupLandingResult) => void;
}

export function useSetupLanding({
  showSetupLanding,
  setupCompleted,
  updateConfig,
  closeConfig,
  savedViews,
  weekStartDay,
}: UseSetupLandingParams): UseSetupLandingReturn {
  const [setupDismissed, setSetupDismissed] = useState(false);
  const shouldShowSetup = !!(showSetupLanding && !setupCompleted && !setupDismissed);

  const handleSetupSkip = useCallback(() => {
    updateConfig(prev => ({
      ...prev,
      setup: { ...(prev['setup'] ?? {}), completed: true },
    }));
    setSetupDismissed(true);
  }, [updateConfig]);

  const handleReopenSetup = useCallback(() => {
    updateConfig(prev => ({
      ...prev,
      setup: { ...(prev['setup'] ?? {}), completed: false },
    }));
    setSetupDismissed(false);
    closeConfig();
  }, [updateConfig, closeConfig]);

  const handleSetupFinish = useCallback((result: SetupLandingResult) => {
    updateConfig(prev => {
      const existingAssets = (Array.isArray(prev['assets']) ? prev['assets'] : []) as Array<{ id: string }>;
      const existingIds = new Set(existingAssets.map(a => a.id));
      const seededAssets = result.assetSeeds
        .filter(seed => !existingIds.has(seed.id))
        .map(seed => ({
          id: seed.id,
          label: seed.label,
          meta: { assetTypeId: seed.assetTypeId },
        }));

      return {
        ...prev,
        title: result.calendarName,
        setup: {
          ...(prev['setup'] ?? {}),
          completed: true,
          preferredTheme: result.theme,
        },
        display: {
          ...(prev['display'] ?? {}),
          defaultView: result.defaultView,
          enabledViews: result.enabledViews,
        },
        team: {
          ...(prev['team'] ?? {}),
          locationLabel: result.locationLabel,
          members: [
            ...((prev['team']?.members ?? []) as Array<{ id: unknown }>)
              .filter(m => !result.teamMembers.some(r => String(r.id) === String(m.id))),
            ...result.teamMembers,
          ],
        },
        assetTypes: result.assetTypes,
        assets: [...existingAssets, ...seededAssets],
        requirementTemplates: result.requirementTemplates,
      };
    });

    for (const recipeId of result.recipes) {
      const recipe = buildRecipeSavedView(recipeId, weekStartDay);
      if (!recipe) continue;
      savedViews.saveView(recipe.name, recipe.filters, {
        view: recipe.view,
        groupBy: recipe.groupBy,
      });
    }

    setSetupDismissed(true);
  }, [updateConfig, savedViews, weekStartDay]);

  return {
    setupDismissed,
    shouldShowSetup,
    handleSetupSkip,
    handleReopenSetup,
    handleSetupFinish,
  };
}
