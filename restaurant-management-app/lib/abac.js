/**
 * Attribute-Based Access Control (ABAC) Policies
 * Flow: Authenticated -> account ACTIVE -> RBAC permission -> ABAC policy.
 * All must pass, default is deny.
 */

/**
 * Dish creation policy
 * CHEF: Must have a linked chefId, can only create with their own chefId.
 * ADMIN: Can create dish with any valid chefId.
 */
function checkDishCreatePolicy(user, bodyChefId) {
  if (!user || (user.status !== 'ACTIVE' && user.status !== 'active')) {
    return {
      allowed: false,
      code: 'ACTIVATION_REQUIRED',
      message: 'Please activate your account before continuing.'
    };
  }

  if (user.role === 'ADMIN') {
    return { allowed: true };
  }

  if (user.role === 'CHEF') {
    if (!user.chefId) {
      return {
        allowed: false,
        code: 'FORBIDDEN',
        message: 'Your chef account is not linked to a kitchen profile.'
      };
    }

    if (bodyChefId !== undefined && bodyChefId !== null && bodyChefId !== '') {
      const parsedChefId = parseInt(bodyChefId, 10);
      if (parsedChefId !== user.chefId) {
        return {
          allowed: false,
          code: 'FORBIDDEN',
          message: 'You cannot create dishes assigned to another chef.'
        };
      }
    }

    return { allowed: true, enforcedChefId: user.chefId };
  }

  return {
    allowed: false,
    code: 'FORBIDDEN',
    message: 'You do not have permission to add new dishes.'
  };
}

/**
 * Dish update policy
 * CHEF: Can only update dishes that THEY cook. Cannot change chefId on update.
 * ADMIN: Can update any dish and change chefId.
 */
function checkDishUpdatePolicy(user, existingDish, newChefId) {
  if (!user || (user.status !== 'ACTIVE' && user.status !== 'active')) {
    return {
      allowed: false,
      code: 'ACTIVATION_REQUIRED',
      message: 'Please activate your account before continuing.'
    };
  }

  if (user.role === 'ADMIN') {
    return { allowed: true };
  }

  if (user.role === 'CHEF') {
    if (!user.chefId) {
      return {
        allowed: false,
        code: 'FORBIDDEN',
        message: 'Your chef account is not linked to a kitchen profile.'
      };
    }

    // Must be the chef who cooks this dish
    if (existingDish.chefId !== user.chefId) {
      return {
        allowed: false,
        code: 'FORBIDDEN',
        message: 'You can only edit dishes that you cook.'
      };
    }

    // Chef cannot change chefId on update (no giving away or stealing dishes)
    if (newChefId !== undefined && newChefId !== null && newChefId !== '') {
      const parsedChefId = parseInt(newChefId, 10);
      if (parsedChefId !== existingDish.chefId) {
        return {
          allowed: false,
          code: 'FORBIDDEN',
          message: 'You cannot transfer ownership of a dish to another chef.'
        };
      }
    }

    return { allowed: true };
  }

  return {
    allowed: false,
    code: 'FORBIDDEN',
    message: 'You do not have permission to edit this dish.'
  };
}

/**
 * Admin User Management Policy
 * - Admin cannot change their own role
 * - Admin cannot demote the last ADMIN
 * - Admin cannot assign a chefId already linked to another user
 */
async function checkAdminUserPolicy(adminUser, targetUser, updates, prisma) {
  const { role: newRole, chefId: newChefId } = updates;

  // 1. Admin cannot change their own role
  if (adminUser.id === targetUser.id && newRole && newRole !== targetUser.role) {
    return {
      allowed: false,
      code: 'FORBIDDEN',
      message: 'You cannot modify your own administrative role.'
    };
  }

  // 2. Admin cannot demote the last ADMIN
  if (targetUser.role === 'ADMIN' && newRole && newRole !== 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: {
        role: 'ADMIN',
        status: 'ACTIVE'
      }
    });

    if (adminCount <= 1) {
      return {
        allowed: false,
        code: 'FORBIDDEN',
        message: 'Cannot demote the last remaining administrator in the system.'
      };
    }
  }

  // 3. Admin cannot assign a chefId already linked to another user
  if (newChefId !== undefined && newChefId !== null) {
    const parsedChefId = parseInt(newChefId, 10);
    if (!isNaN(parsedChefId)) {
      const existingLink = await prisma.user.findFirst({
        where: {
          chefId: parsedChefId,
          id: { not: targetUser.id }
        }
      });

      if (existingLink) {
        return {
          allowed: false,
          code: 'FORBIDDEN',
          message: 'This chef profile is already linked to another user account.'
        };
      }
    }
  }

  return { allowed: true };
}

module.exports = {
  checkDishCreatePolicy,
  checkDishUpdatePolicy,
  checkAdminUserPolicy
};
