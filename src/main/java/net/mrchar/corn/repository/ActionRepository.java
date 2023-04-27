package net.mrchar.corn.repository;

import net.mrchar.corn.model.Action;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(path = "actions")
public interface ActionRepository extends CrudRepository<Action, Long> {
}
