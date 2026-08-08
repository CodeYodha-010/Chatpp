import prisma from '../config/database.js';
import { verifyPassword } from '../utils/password.js';

const User = {
  async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
    });
  },

  async findByEmail(email) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  async findByUsername(username) {
    return prisma.user.findUnique({
      where: { username: username.toLowerCase() },
      select: { id: true, username: true, email: true, displayName: true, avatarColor: true }
    });
  },

  async authenticate(email, password) {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return null;
    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  },

  async updateLastLogin(id) {
    await prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() }
    });
  }
};

export default User;
