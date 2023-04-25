package net.mrchar.corn.repository;

import net.mrchar.corn.model.Category;
import org.springframework.data.repository.CrudRepository;

import java.util.UUID;


public interface CategoryRepository extends CrudRepository<Category, UUID> {
}
