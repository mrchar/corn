package net.mrchar.corn.repository;

import net.mrchar.corn.model.Category;
import net.mrchar.corn.model.projection.CategoryProjection;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;


@RepositoryRestResource(path = "categories", excerptProjection = CategoryProjection.class)
public interface CategoryRepository extends CrudRepository<Category, Long> {
}
