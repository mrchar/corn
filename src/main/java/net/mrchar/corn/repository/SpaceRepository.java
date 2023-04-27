package net.mrchar.corn.repository;

import net.mrchar.corn.model.Space;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(path = "spaces")
public interface SpaceRepository extends CrudRepository<Space, Long> {
}
