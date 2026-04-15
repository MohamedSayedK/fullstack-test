import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TodosService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: number) {
    return this.prisma.todo.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(userId: number, title: string) {
    return this.prisma.todo.create({
      data: { title, userId },
    });
  }

  async update(userId: number, id: number, data: { title?: string; completed?: boolean }) {
    const todo = await this.prisma.todo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException('Todo not found');
    return this.prisma.todo.update({ where: { id }, data });
  }

  async remove(userId: number, id: number) {
    const todo = await this.prisma.todo.findFirst({ where: { id, userId } });
    if (!todo) throw new NotFoundException('Todo not found');
    return this.prisma.todo.delete({ where: { id } });
  }
}
