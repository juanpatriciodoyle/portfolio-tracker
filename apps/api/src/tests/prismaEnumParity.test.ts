import { CostCadence, FixedCostCategory, HousingTenure } from '@prisma/client';
import { COST_CADENCES, FIXED_COST_CATEGORIES, HOUSING_TENURES } from '../contracts';

// The vocabulary (used by the domain, the contracts and the UI) and the Prisma enums cannot import
// each other, so this test is what keeps them from drifting apart.
describe('vocabulary and Prisma enums', () => {
  it.each([
    ['FixedCostCategory', FixedCostCategory, FIXED_COST_CATEGORIES],
    ['CostCadence', CostCadence, COST_CADENCES],
    ['HousingTenure', HousingTenure, HOUSING_TENURES],
  ])('%s lists the same values in the same order', (_name, prismaEnum, vocabulary) => {
    expect(Object.keys(prismaEnum)).toEqual([...vocabulary]);
  });
});
