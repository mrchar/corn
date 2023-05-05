package net.mrchar.corn.repository;

import net.mrchar.corn.model.Budget;
import net.mrchar.corn.model.projection.ActionProjection;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;


@RepositoryRestResource(path = "budgets", excerptProjection = ActionProjection.class)
public interface BudgetRepository extends CrudRepository<Budget, Long> {
}
