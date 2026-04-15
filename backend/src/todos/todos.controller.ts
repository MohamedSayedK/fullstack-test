import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TodosService } from './todos.service';

@UseGuards(JwtAuthGuard)
@Controller('todos')
export class TodosController {
  constructor(private todosService: TodosService) {}

  @Get()
  findAll(@Request() req: { user: { userId: number } }) {
    return this.todosService.findAll(req.user.userId);
  }

  @Post()
  create(
    @Request() req: { user: { userId: number } },
    @Body() body: { title: string },
  ) {
    return this.todosService.create(req.user.userId, body.title);
  }

  @Patch(':id')
  update(
    @Request() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { title?: string; completed?: boolean },
  ) {
    return this.todosService.update(req.user.userId, id, body);
  }

  @Delete(':id')
  remove(
    @Request() req: { user: { userId: number } },
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.todosService.remove(req.user.userId, id);
  }
}
