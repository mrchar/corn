package net.mrchar.corn.repository;

import net.mrchar.corn.model.Budget;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

import java.util.UUID;


@RepositoryRestResource(path = "budgets")
public interface BudgetRepository extends CrudRepository<Budget, Long> {
}
