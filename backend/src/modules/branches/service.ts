import { branchRepository } from './repository';

type BranchRecord = Awaited<ReturnType<typeof branchRepository.listByClinic>>[number];

/** Flatten a branch + its PIC into the shape the clinic-selection list needs. */
function toPublicBranch(branch: BranchRecord) {
  // Prefer the branch's own PIC fields (free-text, from the admin form); fall
  // back to the linked user's name/phone.
  const picUserName = branch.pic
    ? [branch.pic.firstName, branch.pic.lastName].filter(Boolean).join(' ').trim() || null
    : null;
  return {
    id: branch.id,
    clinicId: branch.clinicId,
    code: branch.code,
    name: branch.name,
    picName: branch.picName ?? picUserName,
    contact: branch.contact ?? branch.pic?.phone ?? null,
  };
}

export const branchService = {
  list: async (clinicId: string) => {
    const branches = await branchRepository.listByClinic(clinicId);
    return branches.map(toPublicBranch);
  },
};
