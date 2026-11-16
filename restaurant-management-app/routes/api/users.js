const express = require('express');
const router = express.Router();
const prisma = require('../../lib/prisma');
const { requirePermission } = require('../../lib/authMiddleware');
const { checkAdminUserPolicy } = require('../../lib/abac');

// GET /api/admin/users - List all users with chef profile
router.get('/', requirePermission('user:read'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        chefId: true,
        chef: {
          select: {
            id: true,
            name: true,
            specialty: true
          }
        },
        mfaEnabled: true,
        createdAt: true
      }
    });

    return res.status(200).json({
      ok: true,
      data: users
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id - Update user role and/or chefId
router.patch('/:id', requirePermission('user:manage'), async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const targetUserId = parseInt(rawId, 10);

    if (isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_ID', message: 'Invalid user ID.' }
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      include: { chef: true }
    });

    if (!targetUser) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found.' }
      });
    }

    const { role: newRole, chefId: newChefId } = req.body;

    // Validate role if provided
    if (newRole && !['VIEWER', 'CHEF', 'ADMIN'].includes(newRole.toUpperCase())) {
      return res.status(400).json({
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'Invalid role. Must be VIEWER, CHEF, or ADMIN.' }
      });
    }

    const normalizedRole = newRole ? newRole.toUpperCase() : undefined;

    // Run ABAC policy checks
    const abacResult = await checkAdminUserPolicy(
      req.user,
      targetUser,
      {
        role: normalizedRole,
        chefId: newChefId !== undefined ? (newChefId ? parseInt(newChefId, 10) : null) : undefined
      },
      prisma
    );

    if (!abacResult.allowed) {
      return res.status(403).json({
        ok: false,
        error: {
          code: abacResult.code || 'FORBIDDEN',
          message: abacResult.message
        }
      });
    }

    const updateData = {};
    if (normalizedRole) updateData.role = normalizedRole;
    if (newChefId !== undefined) {
      updateData.chefId = newChefId ? parseInt(newChefId, 10) : null;
    }

    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        chefId: true,
        chef: {
          select: {
            id: true,
            name: true,
            specialty: true
          }
        },
        mfaEnabled: true,
        updatedAt: true
      }
    });

    return res.status(200).json({
      ok: true,
      data: updatedUser,
      message: `User ${updatedUser.username} updated successfully.`
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/mfa-reset - Clear user MFA configuration & recovery codes
router.post('/:id/mfa-reset', requirePermission('user:manage'), async (req, res, next) => {
  try {
    const rawId = req.params.id;
    const targetUserId = parseInt(rawId, 10);

    if (isNaN(targetUserId) || targetUserId <= 0) {
      return res.status(400).json({
        ok: false,
        error: { code: 'INVALID_ID', message: 'Invalid user ID.' }
      });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId }
    });

    if (!targetUser) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'User not found.' }
      });
    }

    await prisma.$transaction([
      prisma.recoveryCode.deleteMany({ where: { userId: targetUserId } }),
      prisma.user.update({
        where: { id: targetUserId },
        data: {
          mfaSecret: null,
          mfaEnabled: false,
          mfaDrift: 0,
          mfaFailedAttempts: 0,
          mfaLockedUntil: null,
          recoveryCodeAttempts: 0,
          recoveryCodeLockedUntil: null
        }
      })
    ]);

    return res.status(200).json({
      ok: true,
      message: `MFA reset successfully for user ${targetUser.username}.`
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
