package net.mrchar.corn.repository;

import net.mrchar.corn.model.Space;
import net.mrchar.corn.model.projection.SpaceProjection;
import org.springframework.data.repository.CrudRepository;
import org.springframework.data.rest.core.annotation.RepositoryRestResource;

@RepositoryRestResource(path = "spaces", excerptProjection = SpaceProjection.class)
public interface SpaceRepository extends CrudRepository<Space, Long> {
}
